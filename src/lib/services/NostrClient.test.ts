import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimplePool, type Relay } from 'nostr-tools';

import NostrClient from './NostrClient';
import KeyManager from './KeyManager';
import { PublicationFailedError } from './publishToRelays';

vi.mock('$lib/stores/cookie', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NostrClient relay readiness', () => {
  it('waits for initial relay connections before deleting', async () => {
    let resolveRelay: (relay: Relay) => void = () => {};
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockImplementation(
      () =>
        new Promise<Relay>((resolve) => {
          resolveRelay = resolve;
        })
    );
    const signError = new Error('signing reached');
    const signEvent = vi.spyOn(KeyManager, 'signEvent').mockRejectedValue(signError);
    const client = new NostrClient(['wss://one']);

    const deletion = client.deleteEvent('event-id');
    await Promise.resolve();
    expect(signEvent).not.toHaveBeenCalled();

    resolveRelay({ url: 'wss://one', on: () => {} } as unknown as Relay);
    await expect(deletion).rejects.toBe(signError);
    expect(signEvent).toHaveBeenCalledOnce();
  });

  it('does not publish to a relay after it disconnects', async () => {
    let onDisconnect = () => {};
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockResolvedValue({
      url: 'wss://one',
      on(type: string, callback: () => void) {
        if (type === 'disconnect') onDisconnect = callback;
      }
    } as Relay);
    const signEvent = vi.spyOn(KeyManager, 'signEvent');
    const client = new NostrClient(['wss://one']);
    await client.connect();

    onDisconnect();
    await expect(client.deleteEvent('event-id')).rejects.toBeInstanceOf(PublicationFailedError);
    expect(signEvent).not.toHaveBeenCalled();
  });
});
