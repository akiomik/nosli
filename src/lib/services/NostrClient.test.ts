import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicKey, SimplePool, type Event, type Pub, type Relay } from 'nostr-tools';

import LongFormContent from '$lib/entities/LongFormContent';
import NostrClient from './NostrClient';
import KeyManager from './KeyManager';
import { PublicationFailedError } from './publishToRelays';

vi.mock('$lib/stores/cookie', async () => {
  const { writable } = await import('svelte/store');
  const { getPublicKey } = await import('nostr-tools');
  const secret = '1'.repeat(64);
  return {
    nip07: writable(false),
    pubkey: writable(getPublicKey(secret)),
    seckey: writable(secret)
  };
});

function fakeRelay(url: string) {
  const listeners = {
    connect: new Set<() => void>(),
    disconnect: new Set<() => void>(),
    error: new Set<() => void>()
  };
  const emit = (type: 'connect' | 'disconnect' | 'error') => {
    listeners[type].forEach((callback) => callback());
  };
  const relay = {
    url,
    status: 1,
    on(type: 'connect' | 'disconnect' | 'error', callback: () => void) {
      listeners[type].add(callback);
      if (type === 'connect' && relay.status === 1) callback();
    },
    off(type: 'connect' | 'disconnect' | 'error', callback: () => void) {
      listeners[type].delete(callback);
    },
    connect: vi.fn(async () => {
      relay.status = 1;
      emit('connect');
    }),
    close: vi.fn(() => {
      relay.status = 3;
      emit('disconnect');
    })
  };
  return {
    relay: relay as unknown as Relay,
    connect: relay.connect,
    close: relay.close,
    disconnect: () => {
      relay.status = 3;
      emit('disconnect');
    },
    startConnecting: () => {
      relay.status = 0;
    },
    finishConnecting: () => {
      relay.status = 1;
      emit('connect');
    }
  };
}

function acceptingPublication() {
  return {
    on(type: 'ok' | 'failed', callback: () => void) {
      if (type === 'ok') callback();
    },
    off() {}
  } as Pub;
}

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

    resolveRelay(fakeRelay('wss://one').relay);
    await expect(deletion).rejects.toBe(signError);
    expect(signEvent).toHaveBeenCalledOnce();
  });

  it('reconnects a dropped relay before publishing a deletion', async () => {
    const target = fakeRelay('wss://one');
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockResolvedValue(target.relay);
    const publish = vi
      .spyOn(SimplePool.prototype, 'publish')
      .mockImplementation(() => acceptingPublication());
    const client = new NostrClient(['wss://one']);
    await client.connect();

    target.disconnect();
    await expect(client.deleteEvent('event-id')).resolves.toMatchObject({
      acceptedRelays: ['wss://one']
    });
    expect(target.connect).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(['wss://one'], expect.any(Object));
  });

  it('reconnects a dropped relay even while another remains connected', async () => {
    const first = fakeRelay('wss://one');
    const second = fakeRelay('wss://two');
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockImplementation(async (url) =>
      url === 'wss://one' ? first.relay : second.relay
    );
    const publish = vi
      .spyOn(SimplePool.prototype, 'publish')
      .mockImplementation(() => acceptingPublication());
    const client = new NostrClient(['wss://one', 'wss://two']);
    await client.connect();

    second.disconnect();
    await expect(client.deleteEvent('event-id')).resolves.toMatchObject({
      acceptedRelays: ['wss://one', 'wss://two']
    });
    expect(second.connect).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('retries a relay cached after the initial connection fails', async () => {
    const target = fakeRelay('wss://one');
    target.disconnect();
    vi.spyOn(SimplePool.prototype, 'ensureRelay')
      .mockRejectedValueOnce(new Error('initial connection failed'))
      .mockResolvedValue(target.relay);
    const publish = vi
      .spyOn(SimplePool.prototype, 'publish')
      .mockImplementation(() => acceptingPublication());
    const client = new NostrClient(['wss://one']);

    await expect(client.deleteEvent('event-id')).resolves.toMatchObject({
      acceptedRelays: ['wss://one']
    });
    expect(target.connect).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(['wss://one'], expect.any(Object));
  });

  it('waits for an initial connection that is still opening after the first timeout', async () => {
    const target = fakeRelay('wss://one');
    target.startConnecting();
    const ensureRelay = vi
      .spyOn(SimplePool.prototype, 'ensureRelay')
      .mockImplementationOnce(() => new Promise<Relay>(() => {}))
      .mockResolvedValue(target.relay);
    vi.spyOn(SimplePool.prototype, 'publish').mockImplementation(() => acceptingPublication());
    const client = new NostrClient(['wss://one'], 100);
    await client.connect();

    const deletion = client.deleteEvent('event-id');
    const assertion = expect(deletion).resolves.toMatchObject({
      acceptedRelays: ['wss://one']
    });
    await vi.waitFor(() => expect(ensureRelay).toHaveBeenCalledTimes(2));
    target.finishConnecting();
    await assertion;
    expect(target.connect).not.toHaveBeenCalled();
  });

  it('checks the relay list again after signing a new article', async () => {
    const first = fakeRelay('wss://one');
    const second = fakeRelay('wss://two');
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockImplementation(async (url) =>
      url === 'wss://one' ? first.relay : second.relay
    );
    const publish = vi
      .spyOn(SimplePool.prototype, 'publish')
      .mockImplementation(() => acceptingPublication());
    const originalSignEvent = KeyManager.signEvent.bind(KeyManager);
    let resumeSigning = () => {};
    const signing = new Promise<void>((resolve) => {
      resumeSigning = resolve;
    });
    vi.spyOn(KeyManager, 'signEvent').mockImplementation(async (event: Event) => {
      await signing;
      return originalSignEvent(event);
    });
    const client = new NostrClient(['wss://one', 'wss://two']);
    await client.connect();

    const article = new LongFormContent(
      undefined,
      'test',
      getPublicKey('1'.repeat(64)),
      'content',
      new Date(),
      'title',
      '',
      undefined,
      undefined,
      []
    );
    const publication = client.postLongFormContent(article);
    await vi.waitFor(() => expect(KeyManager.signEvent).toHaveBeenCalledOnce());
    second.disconnect();
    resumeSigning();

    await expect(publication).resolves.toMatchObject({
      publication: { acceptedRelays: ['wss://one'] }
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(['wss://one'], expect.any(Object));
  });

  it('does not publish after the client closes during signing', async () => {
    const target = fakeRelay('wss://one');
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockResolvedValue(target.relay);
    const publish = vi.spyOn(SimplePool.prototype, 'publish');
    const originalSignEvent = KeyManager.signEvent.bind(KeyManager);
    let resumeSigning = () => {};
    const signing = new Promise<void>((resolve) => {
      resumeSigning = resolve;
    });
    vi.spyOn(KeyManager, 'signEvent').mockImplementation(async (event: Event) => {
      await signing;
      return originalSignEvent(event);
    });
    const client = new NostrClient(['wss://one']);
    await client.connect();
    const article = new LongFormContent(
      undefined,
      'test',
      getPublicKey('1'.repeat(64)),
      'content',
      new Date(),
      'title',
      '',
      undefined,
      undefined,
      []
    );

    const publication = client.postLongFormContent(article);
    const assertion = expect(publication).rejects.toThrow('closed');
    await vi.waitFor(() => expect(KeyManager.signEvent).toHaveBeenCalledOnce());
    await client.close();
    resumeSigning();
    await assertion;
    expect(publish).not.toHaveBeenCalled();
  });

  it('closes a relay that connects after the client closes', async () => {
    const target = fakeRelay('wss://one');
    let resolveRelay: (relay: Relay) => void = () => {};
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockImplementation(
      () =>
        new Promise<Relay>((resolve) => {
          resolveRelay = resolve;
        })
    );
    vi.spyOn(SimplePool.prototype, 'close').mockResolvedValue();
    const client = new NostrClient(['wss://one']);
    await client.close();
    resolveRelay(target.relay);
    await vi.waitFor(() => expect(target.close).toHaveBeenCalledOnce());
    await expect(client.deleteEvent('event-id')).rejects.toThrow('closed');
  });

  it('does not sign or publish if no relay becomes available', async () => {
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockRejectedValue(new Error('offline'));
    const publish = vi.spyOn(SimplePool.prototype, 'publish');
    const signEvent = vi.spyOn(KeyManager, 'signEvent');
    const client = new NostrClient(['wss://one']);
    await expect(client.deleteEvent('event-id')).rejects.toBeInstanceOf(PublicationFailedError);
    expect(signEvent).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
