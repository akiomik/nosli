// The WebSocket that rx-nostr opens to each relay, around the browser's own. It guards rx-nostr
// against what a relay, or the browser, can do to it:
//
// - rx-nostr closes connections with codes of its own, 4537 when it lets an idle one go and 4538
//   when it is disposed, and takes any close with one of them for its own. A relay that closed with
//   4538 would leave its connection "connected" without a socket, and every later request to it
//   would never end. So a close with one of these codes that rx-nostr did not ask for is passed on as
//   a lost connection (1006).
// - The browser can refuse to open a socket at all, as to a blocked port, and throw. rx-nostr would
//   throw too, and fail the request of every relay. So the socket fails as a connection that could
//   not be made does, after the constructor returns.

// The close codes that rx-nostr uses for itself.
const RX_NOSTR_CLOSE_CODES = [4537, 4538];
// What a browser reports for a connection that was lost or never made.
const ABNORMAL_CLOSURE = 1006;

type Listener = (event: never) => void;
type EventType = 'open' | 'message' | 'close' | 'error';

export class RelaySocket {
  private readonly socket: WebSocket | undefined;
  private readonly listeners = new Map<EventType, Set<Listener>>();
  // The close code that rx-nostr asked for, if it closed the socket.
  private closingWith: number | undefined;

  constructor(readonly url: string) {
    try {
      this.socket = new globalThis.WebSocket(url);
    } catch {
      setTimeout(() => {
        this.dispatch('error', { type: 'error' });
        this.dispatch('close', { type: 'close', code: ABNORMAL_CLOSURE, reason: '' });
      });
      return;
    }
    for (const type of ['open', 'message', 'close', 'error'] as const) {
      this.socket.addEventListener(type, (event) => this.receive(type, event));
    }
  }

  get readyState(): number {
    // A socket that could not be made is closed.
    return this.socket?.readyState ?? 3;
  }

  addEventListener(type: EventType, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: EventType, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string) {
    this.socket?.send(data);
  }

  close(code?: number) {
    this.closingWith = code;
    this.socket?.close(code);
  }

  private receive(type: EventType, event: Event) {
    if (type === 'close') {
      const { code, reason } = event as CloseEvent;
      const borrowed = RX_NOSTR_CLOSE_CODES.includes(code) && code !== this.closingWith;
      this.dispatch('close', { type: 'close', code: borrowed ? ABNORMAL_CLOSURE : code, reason });
      return;
    }
    this.dispatch(type, event);
  }

  private dispatch(type: EventType, event: object) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      (listener as (event: object) => void)(event);
    }
  }
}
