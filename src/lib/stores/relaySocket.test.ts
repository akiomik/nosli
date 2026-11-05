import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FakeWebSocket,
  dropConnectionsOf,
  requestsTo,
  sendFrameFrom,
  setRelayBehavior,
  setRelayEvents,
  socketsTo
} from '#lib/testing/FakeWebSocket.js';
import { RelaySocket } from './relaySocket';

const url = 'wss://a.example.com';

// A socket to the relay, open, with what it dispatches.
const opened = async () => {
  const socket = new RelaySocket(url);
  const events: { type: string; code?: number }[] = [];
  for (const type of ['open', 'close', 'error'] as const) {
    socket.addEventListener(type, ((event: { code?: number }) =>
      events.push({ type, code: event.code })) as never);
  }
  await vi.advanceTimersByTimeAsync(10);
  return { socket, events };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RelaySocket', () => {
  it.each([4537, 4538])(
    'passes on a close with %s from the relay as a lost connection',
    async (code) => {
      const { events } = await opened();

      dropConnectionsOf(url, code);

      expect(events).toEqual([{ type: 'open' }, { type: 'close', code: 1006 }]);
    }
  );

  it.each([4537, 4538, 1000])(
    'passes on a close that rx-nostr asked for as it is: %s',
    async (code) => {
      const { socket, events } = await opened();

      socket.close(code);

      expect(events.at(-1)).toEqual({ type: 'close', code });
    }
  );

  it('passes on other codes from the relay as they are', async () => {
    const { events } = await opened();

    dropConnectionsOf(url, 4000);

    expect(events.at(-1)).toEqual({ type: 'close', code: 4000 });
  });

  it('fails after the constructor returns when the browser throws instead of opening a socket', async () => {
    setRelayBehavior(url, 'throw');

    const { socket, events } = await opened();

    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(events).toEqual([{ type: 'error' }, { type: 'close', code: 1006 }]);
    expect(() => socket.send('["REQ","1",{}]')).not.toThrow();
  });

  it('sends a REQ once while its subscription is open', async () => {
    setRelayBehavior(url, 'silent');
    const { socket } = await opened();

    socket.send(JSON.stringify(['REQ', 'one', { kinds: [1] }]));
    socket.send(JSON.stringify(['REQ', 'one', { kinds: [1] }]));
    socket.send(JSON.stringify(['REQ', 'two', { kinds: [1] }]));

    expect(requestsTo(url)).toEqual([[{ kinds: [1] }], [{ kinds: [1] }]]);
  });

  it('sends a REQ again when it replaces the filters of its subscription', async () => {
    setRelayBehavior(url, 'silent');
    const { socket } = await opened();

    socket.send(JSON.stringify(['REQ', 'one', { kinds: [1] }]));
    socket.send(JSON.stringify(['REQ', 'one', { kinds: [7] }]));

    expect(requestsTo(url)).toEqual([[{ kinds: [1] }], [{ kinds: [7] }]]);
  });

  it('sends a REQ again once its subscription was closed by a CLOSE or a CLOSED', async () => {
    setRelayBehavior(url, 'reject');
    const { socket } = await opened();
    const req = JSON.stringify(['REQ', 'one', { kinds: [1] }]);

    socket.send(req);
    socket.send(JSON.stringify(['CLOSE', 'one']));
    socket.send(req);
    // The relay answers with CLOSED.
    await vi.advanceTimersByTimeAsync(10);
    socket.send(req);

    expect(requestsTo(url)).toHaveLength(3);
  });

  it('sends a REQ again once a CLOSED for it arrives, with whitespace in its frame', async () => {
    setRelayBehavior(url, 'silent');
    const { socket } = await opened();
    const req = JSON.stringify(['REQ', 'one', { kinds: [1] }]);

    socket.send(req);
    sendFrameFrom(url, ' [ "CLOSED" , "one", "blocked" ]');
    socket.send(req);

    expect(requestsTo(url)).toHaveLength(2);
  });

  it('sends a REQ once, and again after a CLOSE, with whitespace in their frames', async () => {
    setRelayBehavior(url, 'silent');
    const { socket } = await opened();
    const req = ' [ "REQ", "one", {"kinds": [1]} ]';

    socket.send(req);
    socket.send(req);
    socket.send('[ "CLOSE", "one" ]');
    socket.send(req);

    expect(requestsTo(url)).toHaveLength(2);
  });

  it('sends a REQ again on a new socket', async () => {
    setRelayEvents(url, []);
    const req = JSON.stringify(['REQ', 'one', { kinds: [1] }]);
    const first = await opened();
    first.socket.send(req);
    dropConnectionsOf(url);

    const second = await opened();
    second.socket.send(req);

    expect(socketsTo(url).map((socket) => socket.sent)).toEqual([[req], [req]]);
  });
});
