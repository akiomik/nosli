import type { Event } from 'nostr-tools';

// How a fake relay behaves. It opens and accepts every event (ack), fails to open (refuse), never
// opens (hang), opens and refuses every event (reject), opens and never answers an event (silent), or
// opens and drops the connection when it gets an event (drop).
export type RelayBehavior = 'ack' | 'refuse' | 'hang' | 'reject' | 'silent' | 'drop';

// Relays are looked up by URL as the WebSocket gets it, with a trailing slash on a bare host.
const keyOf = (url: string) => new URL(url).href;
const behaviors = new Map<string, RelayBehavior>();
const openDelays = new Map<string, number>();

export const setRelayBehavior = (url: string, behavior: RelayBehavior) =>
  behaviors.set(keyOf(url), behavior);

export const setOpenDelay = (url: string, delayInMillis: number) =>
  openDelays.set(keyOf(url), delayInMillis);

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

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
    const behavior = this.behavior();
    if (behavior === 'refuse') setTimeout(() => this.fail(), 1);
    if (behavior !== 'refuse' && behavior !== 'hang') {
      setTimeout(() => this.open(), openDelays.get(keyOf(url)) ?? 1);
    }
  }

  // Forgets every relay and socket.
  static reset() {
    behaviors.clear();
    openDelays.clear();
    FakeWebSocket.instances = [];
  }

  // The events that every socket sent.
  static sentEvents(): Event[] {
    return FakeWebSocket.instances.flatMap((socket) => socket.sentEvents());
  }

  private behavior(): RelayBehavior {
    return behaviors.get(keyOf(this.url)) ?? 'ack';
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
    this.onopen?.({});
  }

  fail() {
    this.readyState = 3;
    this.onerror?.({});
    this.onclose?.({ code: 1006, reason: '' });
  }

  // As in a browser, a socket that is still connecting throws, and one that is closing or closed
  // drops the message.
  send(message: string) {
    if (this.readyState === 0) throw new Error('WebSocket is not open');
    if (this.readyState !== 1) return;
    this.sent.push(message);
    const [type, event] = JSON.parse(message);
    if (type !== 'EVENT') return;

    const answer = (accepted: boolean, reason: string) =>
      setTimeout(() => {
        if (this.readyState !== 1) return;
        this.onmessage?.({ data: JSON.stringify(['OK', event.id, accepted, reason]) });
      }, 1);
    const behavior = this.behavior();
    if (behavior === 'ack') answer(true, '');
    if (behavior === 'reject') answer(false, 'blocked: not on the allowlist');
    if (behavior === 'drop') setTimeout(() => this.drop(), 1);
  }

  // The relay closes the connection.
  drop() {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: '' });
  }

  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: '' });
  }
}
