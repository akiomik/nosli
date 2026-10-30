import { describe, expect, it, vi } from 'vitest';
import type { Event, Pub, SimplePool } from 'nostr-tools';

import { publishToRelays } from './publishToRelays';

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

  it('waits for every relay acknowledgment', async () => {
    const { pool, publish, callbacks } = fakePool();
    let settled = false;
    const result = publishToRelays(pool, ['wss://one', 'wss://two'], event).then(() => {
      settled = true;
    });

    expect(publish).toHaveBeenCalledWith(['wss://one'], event);
    expect(publish).toHaveBeenCalledWith(['wss://two'], event);
    callbacks.get('wss://one')?.ok?.();
    await Promise.resolve();
    expect(settled).toBe(false);

    callbacks.get('wss://two')?.ok?.();
    await result;
    expect(settled).toBe(true);
  });

  it('rejects when any relay fails', async () => {
    const { pool, callbacks } = fakePool();
    const result = publishToRelays(pool, ['wss://one', 'wss://two'], event);

    callbacks.get('wss://one')?.ok?.();
    callbacks.get('wss://two')?.failed?.();
    await expect(result).rejects.toBeUndefined();
  });
});
