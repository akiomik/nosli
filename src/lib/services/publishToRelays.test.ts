import { describe, expect, it, vi } from 'vitest';
import { SimplePool, type Event } from 'nostr-tools';

import { setRelayBehavior } from '#lib/testing/FakeWebSocket.js';
import { PublicationFailedError, publishToRelays, type Publisher } from './publishToRelays';

// A pool whose publication to each relay is accepted with ok, refused by the relay with failed, and
// ends in what nostr-tools gives otherwise with fail.
function fakePool() {
  const callbacks = new Map<
    string,
    Record<'ok' | 'failed', () => void> & { fail: (reason: unknown) => void }
  >();
  const publish = vi.fn((relays: string[]): Promise<string>[] => {
    const relay = relays[0];
    return [
      new Promise<string>((resolve, reject) => {
        callbacks.set(relay, {
          ok: () => resolve(''),
          failed: () => reject(new Error('blocked: not on the allowlist')),
          fail: reject
        });
      })
    ];
  });

  return { pool: { publish } as Publisher, publish, callbacks };
}

// The error that nostr-tools gives for an event sent on a connection that has closed.
const sendingOnClosedConnection = () => {
  const error = new Error(
    'Tried to send message \'["EVENT",{}]\' on a closed connection to wss://one.'
  );
  error.name = 'SendingOnClosedConnection';
  return error;
};

describe('publishToRelays', () => {
  const event = {} as Event;

  it('rejects without publishing when no relays are available', async () => {
    const { pool, publish } = fakePool();

    await expect(publishToRelays(pool, [], event)).rejects.toBeInstanceOf(PublicationFailedError);
    expect(publish).not.toHaveBeenCalled();
  });

  it('waits for every relay acknowledgment', async () => {
    const { pool, publish, callbacks } = fakePool();
    let settled = false;
    const result = publishToRelays(pool, ['wss://one', 'wss://two'], event);
    void result.then(() => {
      settled = true;
    });

    expect(publish).toHaveBeenCalledWith(['wss://one'], event);
    expect(publish).toHaveBeenCalledWith(['wss://two'], event);
    callbacks.get('wss://one')?.ok?.();
    await new Promise((resolve) => setTimeout(resolve));
    expect(settled).toBe(false);

    callbacks.get('wss://two')?.ok?.();
    await expect(result).resolves.toEqual({
      acceptedRelays: ['wss://one', 'wss://two'],
      rejectedRelays: [],
      timedOutRelays: [],
      unavailableRelays: []
    });
    expect(settled).toBe(true);
  });

  it('reports partial success when another relay rejects the event', async () => {
    const { pool, callbacks } = fakePool();
    const result = publishToRelays(pool, ['wss://one', 'wss://two'], event);

    callbacks.get('wss://one')?.ok?.();
    callbacks.get('wss://two')?.failed?.();
    await expect(result).resolves.toEqual({
      acceptedRelays: ['wss://one'],
      rejectedRelays: ['wss://two'],
      timedOutRelays: [],
      unavailableRelays: []
    });
  });

  it('keeps configured but unavailable relays in a partial result', async () => {
    const { pool, callbacks } = fakePool();
    const result = publishToRelays(pool, ['wss://one'], event, 50, ['wss://two']);
    callbacks.get('wss://one')?.ok?.();
    await expect(result).resolves.toEqual({
      acceptedRelays: ['wss://one'],
      rejectedRelays: [],
      timedOutRelays: [],
      unavailableRelays: ['wss://two']
    });
  });

  it('rejects if every relay rejects the event', async () => {
    const { pool, callbacks } = fakePool();
    const result = publishToRelays(pool, ['wss://one', 'wss://two'], event);

    callbacks.get('wss://one')?.failed?.();
    callbacks.get('wss://two')?.failed?.();
    await expect(result).rejects.toMatchObject({
      result: { acceptedRelays: [], rejectedRelays: ['wss://one', 'wss://two'], timedOutRelays: [] }
    });
  });

  it('bounds a silent relay and returns the accepted relay', async () => {
    vi.useFakeTimers();
    try {
      const { pool, callbacks } = fakePool();
      const result = publishToRelays(pool, ['wss://one', 'wss://two'], event, 50);

      callbacks.get('wss://one')?.ok?.();
      await vi.advanceTimersByTimeAsync(50);
      await expect(result).resolves.toEqual({
        acceptedRelays: ['wss://one'],
        rejectedRelays: [],
        timedOutRelays: ['wss://two'],
        unavailableRelays: []
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects if no relay acknowledges before the timeout', async () => {
    vi.useFakeTimers();
    try {
      const { pool } = fakePool();
      const result = publishToRelays(pool, ['wss://one'], event, 50);
      const assertion = expect(result).rejects.toMatchObject({
        result: { acceptedRelays: [], rejectedRelays: [], timedOutRelays: ['wss://one'] }
      });

      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  // The relay never got the event, as with one that does not answer.
  it('counts the real SimplePool response for a relay that cannot connect as unanswered', async () => {
    setRelayBehavior('wss://disconnected.example', 'refuse');
    const pool = new SimplePool();

    await expect(
      publishToRelays(pool, ['wss://disconnected.example'], event)
    ).rejects.toMatchObject({
      result: {
        acceptedRelays: [],
        rejectedRelays: [],
        timedOutRelays: ['wss://disconnected.example']
      }
    });
  });

  it('counts the real answer of a relay whose connection has closed as unanswered', async () => {
    const pool = new SimplePool();
    const relay = await pool.ensureRelay('wss://closed.example');
    relay.close();
    const publisher: Publisher = { publish: (_relays, event) => [relay.publish(event)] };

    await expect(publishToRelays(publisher, ['wss://closed.example'], event)).rejects.toMatchObject(
      {
        result: { acceptedRelays: [], rejectedRelays: [], timedOutRelays: ['wss://closed.example'] }
      }
    );
  });

  it.each([
    ['a string, as the pool gives for a failed connection', () => 'connection failure: refused'],
    ['an event sent on a closed connection', sendingOnClosedConnection],
    ['an answer that timed out', () => new Error('publish timed out')],
    ['a connection that closed', () => new Error('relay connection closed')],
    ['a connection that errored', () => new Error('relay connection errored')]
  ])('counts %s as unanswered', async (_case, reason) => {
    const { pool, callbacks } = fakePool();
    const result = publishToRelays(pool, ['wss://one', 'wss://two'], event);

    callbacks.get('wss://one')?.ok?.();
    callbacks.get('wss://two')?.fail(reason());
    await expect(result).resolves.toEqual({
      acceptedRelays: ['wss://one'],
      rejectedRelays: [],
      timedOutRelays: ['wss://two'],
      unavailableRelays: []
    });
  });

  it('counts the reason of a relay that refuses the event as a rejection', async () => {
    const { pool, callbacks } = fakePool();
    const result = publishToRelays(pool, ['wss://one', 'wss://two'], event);

    callbacks.get('wss://one')?.ok?.();
    callbacks.get('wss://two')?.fail(new Error('invalid: bad signature'));
    await expect(result).resolves.toMatchObject({
      acceptedRelays: ['wss://one'],
      rejectedRelays: ['wss://two'],
      timedOutRelays: []
    });
  });

  it('propagates a local publish error instead of recording relay rejection', async () => {
    const { pool, publish } = fakePool();
    const error = new Error('invalid event');
    publish.mockImplementation(() => {
      throw error;
    });

    await expect(publishToRelays(pool, ['wss://one'], event)).rejects.toBe(error);
  });
});
