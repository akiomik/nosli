import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPublicKey,
  Kind,
  nip19,
  SimplePool,
  type Event,
  type Pub,
  type Relay
} from 'nostr-tools';

import LongFormContent from '$lib/entities/LongFormContent';
import NostrClient, { nip19ToHex } from './NostrClient';
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

const listVersion = (id: string | undefined, pubkey = getPublicKey('1'.repeat(64))) =>
  new LongFormContent(
    id,
    'edited-list',
    pubkey,
    'content',
    new Date(),
    'title',
    '',
    undefined,
    undefined,
    []
  );

// The latest version of a list that has been edited, so relays may hold earlier versions too.
const publishedArticle = listVersion('f'.repeat(64));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('nip19ToHex', () => {
  const id = '07'.repeat(32);

  it('returns the event ID of a note or an nevent', () => {
    expect(nip19ToHex(nip19.noteEncode(id))).toBe(id);
    expect(nip19ToHex(nip19.neventEncode({ id, relays: ['wss://relay.example.com'] }))).toBe(id);
  });

  it('rejects a note whose event ID is not 32 bytes', () => {
    expect(() => nip19ToHex(nip19.noteEncode(id.slice(2)))).toThrow();
    expect(() => nip19ToHex(nip19.noteEncode(id + '07'))).toThrow();
  });

  it('rejects an identifier that is not a note or an nevent', () => {
    expect(() => nip19ToHex(nip19.npubEncode(id))).toThrow();
    expect(() => nip19ToHex('note1invalid')).toThrow();
  });
});

describe('NostrClient.deleteArticle', () => {
  it('targets the address of the article as well as its latest event', async () => {
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockResolvedValue(fakeRelay('wss://one').relay);
    const publish = vi
      .spyOn(SimplePool.prototype, 'publish')
      .mockImplementation(() => acceptingPublication());
    const client = new NostrClient(['wss://one']);

    await client.deleteArticle(publishedArticle);

    expect(publish).toHaveBeenCalledOnce();
    expect(publish.mock.calls[0][1]).toMatchObject({
      kind: Kind.EventDeletion,
      pubkey: publishedArticle.pubkey,
      tags: [
        ['e', publishedArticle.id],
        ['a', `${Kind.Article}:${publishedArticle.pubkey}:edited-list`],
        ['k', `${Kind.Article}`]
      ]
    });
  });

  it('does not publish a request that someone other than the author signed', async () => {
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockResolvedValue(fakeRelay('wss://one').relay);
    const publish = vi.spyOn(SimplePool.prototype, 'publish');
    const client = new NostrClient(['wss://one']);
    const othersArticle = listVersion('f'.repeat(64), getPublicKey('2'.repeat(64)));

    await expect(client.deleteArticle(othersArticle)).rejects.toThrow('not signed by the author');
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not sign a request for an article that was never published', async () => {
    const signEvent = vi.spyOn(KeyManager, 'signEvent');
    const client = new NostrClient([]);
    const draft = listVersion(undefined);

    await expect(client.deleteArticle(draft)).rejects.toThrow('not published');
    expect(signEvent).not.toHaveBeenCalled();
  });
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

    const deletion = client.deleteArticle(publishedArticle);
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
    await expect(client.deleteArticle(publishedArticle)).resolves.toMatchObject({
      acceptedRelays: ['wss://one']
    });
    expect(target.connect).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(['wss://one'], expect.any(Object));
  });

  it('includes a promptly reconnected relay in a deletion', async () => {
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
    await expect(client.deleteArticle(publishedArticle)).resolves.toMatchObject({
      acceptedRelays: ['wss://one', 'wss://two'],
      unavailableRelays: []
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

    await expect(client.deleteArticle(publishedArticle)).resolves.toMatchObject({
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

    const deletion = client.deleteArticle(publishedArticle);
    const assertion = expect(deletion).resolves.toMatchObject({
      acceptedRelays: ['wss://one']
    });
    await vi.waitFor(() => expect(ensureRelay).toHaveBeenCalledTimes(2));
    target.finishConnecting();
    await assertion;
    expect(target.connect).not.toHaveBeenCalled();
  });

  it('reconnects a relay that drops during signing a new article', async () => {
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
      publication: { acceptedRelays: ['wss://one', 'wss://two'] }
    });
    expect(second.connect).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith(['wss://one'], expect.any(Object));
    expect(publish).toHaveBeenCalledWith(['wss://two'], expect.any(Object));
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
    await expect(client.deleteArticle(publishedArticle)).rejects.toThrow('closed');
  });

  it('does not sign or publish if no relay becomes available', async () => {
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockRejectedValue(new Error('offline'));
    const publish = vi.spyOn(SimplePool.prototype, 'publish');
    const signEvent = vi.spyOn(KeyManager, 'signEvent');
    const client = new NostrClient(['wss://one']);
    await expect(client.deleteArticle(publishedArticle)).rejects.toBeInstanceOf(
      PublicationFailedError
    );
    expect(signEvent).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
