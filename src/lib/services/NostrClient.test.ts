import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19, SimplePool } from 'nostr-tools';
import type { AbstractRelay } from 'nostr-tools/abstract-relay';

import LongFormContent from '#lib/entities/LongFormContent.js';
import { nip07 } from '#lib/stores/cookie.js';
import { KIND, publicKeyOf, signWith, type Event } from '#lib/testing/nostr.js';
import NostrClient, { decodeNoteId } from './NostrClient';
import KeyManager, { Nip07CanceledError } from './KeyManager';
import { PublicationFailedError, SignedByAnotherAccountError } from './publishToRelays';

vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  const { publicKeyOf } = await import('#lib/testing/nostr.js');
  const secret = '1'.repeat(64);
  return {
    nip07: writable(false),
    pubkey: writable(publicKeyOf(secret)),
    seckey: writable(secret)
  };
});

// What the relays were sent, as (url, event). Each relay accepts unless a test says otherwise.
const publish = vi.fn<(url: string, event: Event) => Promise<string>>();
beforeEach(() => {
  publish.mockReset().mockResolvedValue('');
});

// A relay of nostr-tools, which is connected once the pool's ensureRelay gives it.
function fakeRelay(url: string) {
  const relay = {
    url,
    connected: true,
    publishTimeout: 4400,
    publish: (event: Event) => publish(url, event),
    close: vi.fn(() => {
      relay.connected = false;
    })
  };
  return {
    relay: relay as unknown as AbstractRelay,
    close: relay.close,
    disconnect: () => {
      relay.connected = false;
    }
  };
}

// The pool's ensureRelay, which connects the relay of the URL again, as nostr-tools does.
function ensuring(...relays: ReturnType<typeof fakeRelay>[]) {
  return vi.spyOn(SimplePool.prototype, 'ensureRelay').mockImplementation(async (url) => {
    const target = relays.find(({ relay }) => relay.url === url) ?? relays[0];
    (target.relay as unknown as { connected: boolean }).connected = true;
    return target.relay;
  });
}

const listVersion = (id: string | undefined, pubkey = publicKeyOf('1'.repeat(64))) =>
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

describe('decodeNoteId', () => {
  const id = '07'.repeat(32);
  const nip19ToHex = (b32: string) => decodeNoteId(b32).id;

  it('returns the event ID of a note or an nevent', () => {
    expect(decodeNoteId(nip19.noteEncode(id))).toEqual({ id, relays: [] });
    expect(nip19ToHex(nip19.neventEncode({ id, relays: ['wss://relay.example.com'] }))).toBe(id);
  });

  it('returns the event ID in lowercase hex for an identifier in uppercase', () => {
    expect(nip19ToHex(nip19.noteEncode(id).toUpperCase())).toBe(id);
    expect(nip19ToHex(nip19.neventEncode({ id }).toUpperCase())).toBe(id);
  });

  // From #99 by koteitan: a note that only these relays had.
  it('returns the relays that an nevent hints at', () => {
    const nevent =
      'nevent1qvzqqqqqqypzqwyu5j2hjyd3ycyn7s4q4yrcv52mtyc3m3dfg26qf4lpdutjs7pgqyxhwumn8ghj77tpvf6jumt9qys8wumn8ghj7un9d3shjtt2wqhxummnw3ezuamfwfjkgmn9wshx5uqpz9mhxue69uhhytntda4xjunp9e5k7qpql36sphgcnnjv4dcyfjy627gw5fsf5y5n2rrqnh5f8m2hgxavcr0s80yhul';

    expect(decodeNoteId(nevent)).toEqual({
      id: 'fc7500dd189ce4cab7044c89a5790ea2609a129350c609de893ed5741bacc0df',
      relays: ['wss://yabu.me', 'wss://relay-jp.nostr.wirednet.jp', 'wss://r.kojira.io']
    });
  });

  it('keeps only the wss:// relay hints of an nevent', () => {
    const relays = ['wss://Relay.Example.com/', 'ws://insecure.example.com', 'not a url'];

    expect(decodeNoteId(nip19.neventEncode({ id, relays })).relays).toEqual([
      'wss://relay.example.com'
    ]);
  });

  it('rejects a note or an nevent whose event ID is not 32 bytes', () => {
    expect(() => nip19ToHex(nip19.noteEncode(id.slice(2)))).toThrow();
    expect(() => nip19ToHex(nip19.noteEncode(id + '07'))).toThrow();
    expect(() => nip19ToHex(nip19.neventEncode({ id: id.slice(2) }))).toThrow();
  });

  it('rejects an identifier that is not a note or an nevent', () => {
    expect(() => nip19ToHex(nip19.npubEncode(id))).toThrow();
    expect(() => nip19ToHex('note1invalid')).toThrow();
  });
});

describe('NostrClient.deleteArticle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('targets the address of the article as well as its latest event', async () => {
    ensuring(fakeRelay('wss://one'));
    const client = new NostrClient(['wss://one']);

    await client.deleteArticle(publishedArticle);

    expect(publish).toHaveBeenCalledOnce();
    expect(publish.mock.calls[0][1]).toMatchObject({
      kind: KIND.deletion,
      pubkey: publishedArticle.pubkey,
      tags: [
        ['e', publishedArticle.id],
        ['a', `${KIND.article}:${publishedArticle.pubkey}:edited-list`],
        ['k', `${KIND.article}`]
      ]
    });
  });

  it.each([
    ['at the current time for an article that is older', 1_799_999_000, 1_800_000_000],
    ['no earlier than an article from a clock that is ahead', 1_800_000_300, 1_800_000_300]
  ])('dates the request %s', async (_case, articleCreatedAt, requestCreatedAt) => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ['Date'] });
    ensuring(fakeRelay('wss://one'));
    const client = new NostrClient(['wss://one']);
    const article = listVersion('f'.repeat(64));
    article.createdAt = new Date(articleCreatedAt * 1000);

    await client.deleteArticle(article);

    expect(publish.mock.calls[0][1]).toMatchObject({ created_at: requestCreatedAt });
  });

  it('does not publish a request that someone other than the author signed', async () => {
    ensuring(fakeRelay('wss://one'));
    const client = new NostrClient(['wss://one']);
    const othersArticle = listVersion('f'.repeat(64), publicKeyOf('2'.repeat(64)));

    await expect(client.deleteArticle(othersArticle)).rejects.toBeInstanceOf(
      SignedByAnotherAccountError
    );
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

describe('NostrClient.postLongFormContent', () => {
  const update = (previous: LongFormContent) =>
    LongFormContent.compose({
      identifier: previous.identifier,
      title: 'New title',
      summary: '',
      notes: [{ id: 'e'.repeat(64) }],
      previous
    });

  afterEach(() => {
    nip07.set(false);
    vi.unstubAllGlobals();
  });

  it('publishes an update that its author signed', async () => {
    ensuring(fakeRelay('wss://one'));
    const client = new NostrClient(['wss://one']);

    await client.postLongFormContent(update(publishedArticle), publishedArticle.pubkey);

    expect(publish.mock.calls[0][1]).toMatchObject({ pubkey: publishedArticle.pubkey });
  });

  it('does not publish an update that another account signed', async () => {
    ensuring(fakeRelay('wss://one'));
    const client = new NostrClient(['wss://one']);
    const othersArticle = listVersion('f'.repeat(64), publicKeyOf('2'.repeat(64)));

    await expect(
      client.postLongFormContent(update(othersArticle), othersArticle.pubkey)
    ).rejects.toBeInstanceOf(SignedByAnotherAccountError);
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps the author from a NIP-07 extension, which may keep a given pubkey', async () => {
    ensuring(fakeRelay('wss://one'));
    // Signs with another account, and keeps the pubkey of the event when it has one, as Alby does.
    const other = '2'.repeat(64);
    const signEvent = vi.fn(async (event: Event) => {
      const signed = signWith(other, { ...event });
      return event.pubkey ? { ...signed, pubkey: event.pubkey } : signed;
    });
    vi.stubGlobal('window', {
      nostr: { getPublicKey: async () => publicKeyOf(other), signEvent }
    });
    nip07.set(true);
    const client = new NostrClient(['wss://one']);

    await expect(
      client.postLongFormContent(update(publishedArticle), publishedArticle.pubkey)
    ).rejects.toBeInstanceOf(SignedByAnotherAccountError);
    expect(signEvent).toHaveBeenCalledWith(expect.objectContaining({ pubkey: '' }));
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes a new list that any account signed', async () => {
    ensuring(fakeRelay('wss://one'));
    const client = new NostrClient(['wss://one']);
    const list = LongFormContent.compose({
      identifier: 'new-list',
      title: 'Title',
      summary: '',
      notes: [{ id: 'e'.repeat(64) }]
    });

    const { content } = await client.postLongFormContent(list);

    expect(content.pubkey).toBe(publicKeyOf('1'.repeat(64)));
    expect(publish).toHaveBeenCalledOnce();
  });
});

describe('NostrClient with a NIP-07 extension that has not signed', () => {
  // An extension whose prompt is left open, which signs only when told to.
  const openPrompt = () => {
    let sign = () => {};
    const signEvent = vi.fn(
      (event: Event) =>
        new Promise<Event>((resolve) => (sign = () => resolve(signWith('1'.repeat(64), event))))
    );
    vi.stubGlobal('window', {
      nostr: { getPublicKey: async () => publicKeyOf('1'.repeat(64)), signEvent }
    });
    nip07.set(true);
    return { signEvent, sign: () => sign() };
  };
  const sending = (action: 'update' | 'delete', signal: AbortSignal, onSigning = vi.fn()) => {
    const client = new NostrClient(['wss://one']);
    const options = { signal, onSigning };
    const update = LongFormContent.compose({
      identifier: publishedArticle.identifier,
      title: 'New title',
      summary: '',
      notes: [{ id: 'e'.repeat(64) }],
      previous: publishedArticle
    });
    return action === 'update'
      ? client.postLongFormContent(update, publishedArticle.pubkey, options)
      : client.deleteArticle(publishedArticle, options);
  };

  afterEach(() => {
    nip07.set(false);
    vi.unstubAllGlobals();
  });

  it.each(['update', 'delete'] as const)(
    'sends no %s once the user stops waiting, even when the signature comes later',
    async (action) => {
      ensuring(fakeRelay('wss://one'));
      const { signEvent, sign } = openPrompt();
      const wait = new AbortController();
      const onSigning = vi.fn();

      const sent = sending(action, wait.signal, onSigning);
      await vi.waitFor(() => expect(signEvent).toHaveBeenCalledOnce());
      expect(onSigning.mock.calls).toEqual([[true]]);
      wait.abort();

      await expect(sent).rejects.toBeInstanceOf(Nip07CanceledError);
      expect(onSigning.mock.calls).toEqual([[true], [false]]);
      sign();
      await new Promise((resolve) => setTimeout(resolve));
      expect(publish).not.toHaveBeenCalled();
    }
  );

  it.each(['update', 'delete'] as const)(
    'sends no %s for a wait that was stopped, whatever signs it',
    async (action) => {
      ensuring(fakeRelay('wss://one'));
      // The secret key of the login signs at once, without looking at the signal.
      const wait = new AbortController();
      wait.abort();

      await expect(sending(action, wait.signal)).rejects.toBeInstanceOf(Nip07CanceledError);
      expect(publish).not.toHaveBeenCalled();
    }
  );

  it('sends the update once signed, and reports when the signer had it', async () => {
    ensuring(fakeRelay('wss://one'));
    const { signEvent, sign } = openPrompt();
    const onSigning = vi.fn();

    const sent = sending('update', new AbortController().signal, onSigning);
    await vi.waitFor(() => expect(signEvent).toHaveBeenCalledOnce());
    sign();

    await expect(sent).resolves.toBeDefined();
    expect(onSigning.mock.calls).toEqual([[true], [false]]);
    expect(publish).toHaveBeenCalledOnce();
  });
});

describe('NostrClient relay readiness', () => {
  it('waits for initial relay connections before deleting', async () => {
    let resolveRelay: (relay: AbstractRelay) => void = () => {};
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockImplementation(
      () =>
        new Promise<AbstractRelay>((resolve) => {
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
    const ensureRelay = ensuring(target);
    const client = new NostrClient(['wss://one']);
    await client.connect();

    target.disconnect();
    await expect(client.deleteArticle(publishedArticle)).resolves.toMatchObject({
      acceptedRelays: ['wss://one']
    });
    expect(ensureRelay).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith('wss://one', expect.any(Object));
  });

  it('includes a promptly reconnected relay in a deletion', async () => {
    const first = fakeRelay('wss://one');
    const second = fakeRelay('wss://two');
    const ensureRelay = ensuring(first, second);
    const client = new NostrClient(['wss://one', 'wss://two']);
    await client.connect();

    second.disconnect();
    await expect(client.deleteArticle(publishedArticle)).resolves.toMatchObject({
      acceptedRelays: ['wss://one', 'wss://two'],
      unavailableRelays: []
    });
    expect(ensureRelay.mock.calls.filter(([url]) => url === 'wss://two')).toHaveLength(2);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('retries a relay cached after the initial connection fails', async () => {
    const target = fakeRelay('wss://one');
    const ensureRelay = vi
      .spyOn(SimplePool.prototype, 'ensureRelay')
      .mockRejectedValueOnce(new Error('initial connection failed'))
      .mockResolvedValue(target.relay);
    const client = new NostrClient(['wss://one']);

    await expect(client.deleteArticle(publishedArticle)).resolves.toMatchObject({
      acceptedRelays: ['wss://one']
    });
    expect(ensureRelay).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith('wss://one', expect.any(Object));
  });

  it('waits for an initial connection that is still opening after the first timeout', async () => {
    // nostr-tools gives each caller the same connection while it opens.
    const target = fakeRelay('wss://one');
    let finishConnecting = () => {};
    const opening = new Promise<AbstractRelay>((resolve) => {
      finishConnecting = () => resolve(target.relay);
    });
    const ensureRelay = vi.spyOn(SimplePool.prototype, 'ensureRelay').mockReturnValue(opening);
    const client = new NostrClient(['wss://one'], 100);
    await client.connect();

    const deletion = client.deleteArticle(publishedArticle);
    const assertion = expect(deletion).resolves.toMatchObject({
      acceptedRelays: ['wss://one']
    });
    await vi.waitFor(() => expect(ensureRelay).toHaveBeenCalledTimes(2));
    finishConnecting();
    await assertion;
  });

  it('reconnects a relay that drops during signing a new article', async () => {
    const first = fakeRelay('wss://one');
    const second = fakeRelay('wss://two');
    const ensureRelay = ensuring(first, second);
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
      publicKeyOf('1'.repeat(64)),
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
    expect(ensureRelay.mock.calls.filter(([url]) => url === 'wss://two')).toHaveLength(2);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledWith('wss://one', expect.any(Object));
    expect(publish).toHaveBeenCalledWith('wss://two', expect.any(Object));
  });

  it('does not publish after the client closes during signing', async () => {
    ensuring(fakeRelay('wss://one'));
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
      publicKeyOf('1'.repeat(64)),
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
    let resolveRelay: (relay: AbstractRelay) => void = () => {};
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockImplementation(
      () =>
        new Promise<AbstractRelay>((resolve) => {
          resolveRelay = resolve;
        })
    );
    vi.spyOn(SimplePool.prototype, 'close').mockImplementation(() => {});
    const client = new NostrClient(['wss://one']);
    await client.close();
    resolveRelay(target.relay);
    await vi.waitFor(() => expect(target.close).toHaveBeenCalledOnce());
    await expect(client.deleteArticle(publishedArticle)).rejects.toThrow('closed');
  });

  it('does not sign or publish if no relay becomes available', async () => {
    vi.spyOn(SimplePool.prototype, 'ensureRelay').mockRejectedValue(new Error('offline'));
    const signEvent = vi.spyOn(KeyManager, 'signEvent');
    const client = new NostrClient(['wss://one']);
    await expect(client.deleteArticle(publishedArticle)).rejects.toBeInstanceOf(
      PublicationFailedError
    );
    expect(signEvent).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
