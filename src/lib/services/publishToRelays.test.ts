import { describe, expect, it, vi } from 'vitest';
import { SimplePool, type Event, type Pub } from 'nostr-tools';

import { PublicationFailedError, publishToRelays } from './publishToRelays';

function fakePool() {
  const callbacks = new Map<string, Partial<Record<'ok' | 'failed', () => void>>>();
  const publish = vi.fn((relays: string[]): Pub => {
    const relay = relays[0];
    const listeners: Partial<Record<'ok' | 'failed', () => void>> = {};
    callbacks.set(relay, listeners);
    return {
      on(type, callback) {
        listeners[type] = callback;
      },
      off() {}
    };
  });

  return { pool: { publish } as Pick<SimplePool, 'publish'>, publish, callbacks };
}

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

  it('handles the real SimplePool response for a relay that was never connected', async () => {
    const pool = new SimplePool();

    await expect(
      publishToRelays(pool, ['wss://disconnected.example'], event)
    ).rejects.toMatchObject({
      result: {
        acceptedRelays: [],
        rejectedRelays: ['wss://disconnected.example'],
        timedOutRelays: []
      }
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
