import type { Event, Filter } from 'nostr-tools';

// How a fake relay behaves. It opens and accepts every event (ack), fails to open (refuse), never
// opens (hang), opens and refuses every event (reject), opens and never answers an event (silent), or
// opens and drops the connection when it gets an event (drop).
//
// It answers a REQ in the same way: with the events that it holds and then EOSE (ack), with CLOSED
// (reject), not at all (silent), or by dropping the connection (drop). One that stalls sends the
// events that it holds, but never EOSE (stall).
export type RelayBehavior = 'ack' | 'refuse' | 'hang' | 'reject' | 'silent' | 'drop' | 'stall';

// Relays are looked up by URL as the WebSocket gets it, with a trailing slash on a bare host.
const keyOf = (url: string) => new URL(url).href;
const behaviors = new Map<string, RelayBehavior>();
const openDelays = new Map<string, number>();
const answerDelays = new Map<string, number>();
const answerIntervals = new Map<string, number>();
const stored = new Map<string, { events: unknown[]; unfiltered: boolean }>();

export const setRelayBehavior = (url: string, behavior: RelayBehavior) =>
  behaviors.set(keyOf(url), behavior);

export const setOpenDelay = (url: string, delayInMillis: number) =>
  openDelays.set(keyOf(url), delayInMillis);

// How long the relay takes to answer a REQ, and how long it waits between the events that it sends.
export const setAnswerDelay = (url: string, delayInMillis: number) =>
  answerDelays.set(keyOf(url), delayInMillis);

export const setAnswerInterval = (url: string, intervalInMillis: number) =>
  answerIntervals.set(keyOf(url), intervalInMillis);

// The events that the relay holds, and sends for a REQ whose filters they match, newest first.
// Anything else, such as null or an object without the fields of an event, is sent for every REQ,
// as a broken relay might. An unfiltered relay sends all of them for every REQ, in this order.
export const setRelayEvents = (url: string, events: unknown[], { unfiltered = false } = {}) =>
  stored.set(keyOf(url), { events, unfiltered });

// The sockets that were opened to the relay, whether they connected or not.
export const socketsTo = (url: string): FakeWebSocket[] =>
  FakeWebSocket.instances.filter((socket) => keyOf(socket.url) === keyOf(url));

// The filters of each REQ that the relay got, over all of its sockets.
export const requestsTo = (url: string): Filter[][] =>
  socketsTo(url).flatMap((socket) =>
    socket.sent
      .map((message) => JSON.parse(message))
      .filter(([type]) => type === 'REQ')
      .map(([, , ...filters]) => filters)
  );

// How many subscriptions the relay has open, over all of its sockets: those that it got a REQ for,
// and neither closed nor got a CLOSE for.
export const openSubscriptionsAt = (url: string): number =>
  socketsTo(url).reduce((count, socket) => count + socket.openSubscriptions(), 0);

// The relay sends this frame, as it is, on every connection that it has open.
export const sendFrameFrom = (url: string, data: string) =>
  socketsTo(url).forEach((socket) => {
    if (socket.readyState === FakeWebSocket.OPEN) socket.dispatchMessage(data);
  });

// The relay drops every connection that it has.
export const dropConnectionsOf = (url: string) =>
  socketsTo(url).forEach((socket) => {
    if (socket.readyState === FakeWebSocket.OPEN) socket.drop();
  });

const looksLikeEvent = (value: unknown): value is Event =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Event).id === 'string' &&
  typeof (value as Event).kind === 'number' &&
  typeof (value as Event).pubkey === 'string' &&
  typeof (value as Event).created_at === 'number' &&
  Array.isArray((value as Event).tags);

// Matches as a relay does: a tag filter matches any tag of its name.
const matches = (filter: Filter, event: Event): boolean =>
  (filter.ids === undefined || filter.ids.includes(event.id)) &&
  (filter.kinds === undefined || filter.kinds.includes(event.kind)) &&
  (filter.authors === undefined || filter.authors.includes(event.pubkey)) &&
  (filter.since === undefined || event.created_at >= filter.since) &&
  (filter.until === undefined || event.created_at <= filter.until) &&
  Object.entries(filter)
    .filter(([key]) => key.startsWith('#'))
    .every(([key, values]) =>
      event.tags.some(
        ([name, value]) => name === key.slice(1) && (values as string[]).includes(value)
      )
    );

// The newest events first, at most `limit` of them for each filter, as a relay sends them.
const answerTo = (filters: Filter[], events: unknown[]): unknown[] => {
  const junk = events.filter((event) => !looksLikeEvent(event));
  const found = new Set<Event>();
  for (const filter of filters) {
    const matching = events
      .filter(looksLikeEvent)
      .filter((event) => matches(filter, event))
      .sort((a, b) => b.created_at - a.created_at);
    matching.slice(0, filter.limit ?? matching.length).forEach((event) => found.add(event));
  }
  return [...junk, ...found];
};

type Listener = (event: never) => void;

// A WebSocket to a fake relay, which the test setup puts in place of the real one, so that no test
// connects to a real relay.
export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];
  // The subscriptions that the relay has open on this socket.
  private subscriptions = new Set<string>();
  private listeners: Record<string, Listener[]> = {};

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
    const behavior = this.behavior();
    const delay = openDelays.get(keyOf(url)) ?? 1;
    if (behavior === 'refuse') setTimeout(() => this.fail(), delay);
    if (behavior !== 'refuse' && behavior !== 'hang') setTimeout(() => this.open(), delay);
  }

  // Forgets every relay and socket.
  static reset() {
    behaviors.clear();
    openDelays.clear();
    answerDelays.clear();
    answerIntervals.clear();
    stored.clear();
    FakeWebSocket.instances = [];
  }

  // The events that every socket sent.
  static sentEvents(): Event[] {
    return FakeWebSocket.instances.flatMap((socket) => socket.sentEvents());
  }

  private behavior(): RelayBehavior {
    return behaviors.get(keyOf(this.url)) ?? 'ack';
  }

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== listener);
  }

  private dispatch(type: 'open' | 'error' | 'close' | 'message', event: object) {
    const handler = {
      open: this.onopen,
      error: this.onerror,
      close: this.onclose,
      message: this.onmessage
    }[type];
    (handler as ((event: object) => void) | null)?.(event);
    for (const listener of [...(this.listeners[type] ?? [])])
      (listener as (event: object) => void)(event);
  }

  openSubscriptions(): number {
    return this.subscriptions.size;
  }

  sentEvents(): Event[] {
    return this.sent
      .map((message) => JSON.parse(message))
      .filter(([type]) => type === 'EVENT')
      .map(([, event]) => event);
  }

  open() {
    if (this.readyState !== 0) return;
    this.readyState = 1;
    this.dispatch('open', { type: 'open' });
  }

  fail() {
    this.readyState = 3;
    this.dispatch('error', { type: 'error' });
    this.dispatch('close', { type: 'close', code: 1006, reason: '' });
  }

  // The relay sends a message, as long as the connection is open.
  receive(message: unknown) {
    if (this.readyState !== 1) return;
    this.dispatchMessage(JSON.stringify(message));
  }

  dispatchMessage(data: string) {
    this.dispatch('message', { type: 'message', data });
  }

  // As in a browser, a socket that is still connecting throws, and one that is closing or closed
  // drops the message.
  send(message: string) {
    if (this.readyState === 0) throw new Error('WebSocket is not open');
    if (this.readyState !== 1) return;
    this.sent.push(message);
    const [type, ...rest] = JSON.parse(message);
    if (type === 'EVENT') this.answerEvent(rest[0]);
    if (type === 'REQ') this.answerReq(rest[0], rest.slice(1));
    if (type === 'CLOSE') this.subscriptions.delete(rest[0]);
  }

  private answerEvent(event: Event) {
    const answer = (accepted: boolean, reason: string) =>
      setTimeout(() => this.receive(['OK', event.id, accepted, reason]), 1);
    const behavior = this.behavior();
    if (behavior === 'ack') answer(true, '');
    if (behavior === 'reject') answer(false, 'blocked: not on the allowlist');
    if (behavior === 'drop') setTimeout(() => this.drop(), 1);
  }

  private answerReq(subId: string, filters: Filter[]) {
    const behavior = this.behavior();
    if (behavior === 'drop') {
      setTimeout(() => this.drop(), 1);
      return;
    }
    this.subscriptions.add(subId);
    const key = keyOf(this.url);
    const { events, unfiltered } = stored.get(key) ?? { events: [], unfiltered: false };
    const answer = unfiltered ? events : answerTo(filters, events);
    const interval = answerIntervals.get(key) ?? 0;
    // Sends the events one by one, then EOSE, as long as the subscription is open.
    const sendFrom = (i: number) => {
      if (!this.subscriptions.has(subId)) return;
      if (i < answer.length) {
        this.receive(['EVENT', subId, answer[i]]);
        if (interval > 0) setTimeout(() => sendFrom(i + 1), interval);
        else sendFrom(i + 1);
        return;
      }
      if (behavior === 'ack') this.receive(['EOSE', subId]);
    };
    setTimeout(
      () => {
        if (!this.subscriptions.has(subId)) return;
        if (behavior === 'reject') {
          this.subscriptions.delete(subId);
          this.receive(['CLOSED', subId, 'blocked: not on the allowlist']);
          return;
        }
        if (behavior === 'ack' || behavior === 'stall') sendFrom(0);
      },
      answerDelays.get(key) ?? 1
    );
  }

  // The relay closes the connection.
  drop() {
    this.readyState = 3;
    this.subscriptions.clear();
    this.dispatch('close', { type: 'close', code: 1006, reason: '' });
  }

  close(code = 1000) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.subscriptions.clear();
    this.dispatch('close', { type: 'close', code, reason: '' });
  }
}
