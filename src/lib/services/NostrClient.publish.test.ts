import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LongFormContent from '#lib/entities/LongFormContent.js';
import { nip07, pubkey, seckey } from '#lib/stores/cookie.js';
import { FakeWebSocket, setRelayBehavior } from '#lib/testing/FakeWebSocket.js';
import {
  KIND,
  connectedPool,
  isSigned,
  newSecretKey,
  publicKeyOf,
  signWith,
  type Event,
  type EventTemplate
} from '#lib/testing/nostr.js';
import { decodeNoteId } from './NostrClient';
import NostrClient from './NostrClient';
import {
  PublicationFailedError,
  SignedByAnotherAccountError,
  publishToRelays
} from './publishToRelays';

vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

// The secret key of the login, kept in the cookies in hex.
const secret = '7'.repeat(64);
const author = publicKeyOf(secret);
const note = 'e'.repeat(64);
const relays = ['wss://one.example', 'wss://two.example'];

const newList = () =>
  LongFormContent.compose({
    identifier: 'my-list',
    title: 'Title',
    summary: 'Summary',
    notes: [{ id: note, relays: ['wss://hint.example.com'] }]
  });

// A version of the list that is on relays, by `by`.
const publishedList = (by = author) =>
  new LongFormContent(
    'f'.repeat(64),
    'my-list',
    by,
    '',
    new Date(1_700_000_000_000),
    'Old title',
    '',
    undefined,
    undefined,
    []
  );

// Publishes with a client of `relays`, which it then closes.
const withClient = async <T>(send: (client: NostrClient) => Promise<T>): Promise<T> => {
  const client = new NostrClient(relays, 100);
  try {
    return await send(client);
  } finally {
    await client.close();
  }
};

beforeEach(() => {
  seckey.set(secret);
  pubkey.set(author);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  nip07.set(false);
  pubkey.set('');
  seckey.set('');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NostrClient.postLongFormContent with a secret key', () => {
  it('sends each relay the list, signed by the logged-in account', async () => {
    const { content, publication } = await withClient((client) =>
      client.postLongFormContent(newList())
    );

    expect(publication).toEqual({
      acceptedRelays: relays,
      rejectedRelays: [],
      timedOutRelays: [],
      unavailableRelays: []
    });
    expect(FakeWebSocket.instances.map((socket) => socket.sentEvents().length)).toEqual([1, 1]);
    const [event] = FakeWebSocket.instances[0].sentEvents();
    expect(FakeWebSocket.instances[1].sentEvents()).toEqual([event]);
    expect(isSigned(event)).toBe(true);
    expect(event).toMatchObject({ kind: KIND.article, pubkey: author });
    expect(event.tags).toEqual([
      ['d', 'my-list'],
      ['title', 'Title'],
      ['summary', 'Summary'],
      ['e', note, 'wss://hint.example.com'],
      ['t', 'nosli']
    ]);
    expect(decodeNoteId(event.content.replace(/^nostr:/, ''))).toEqual({
      id: note,
      relays: ['wss://hint.example.com']
    });
    expect(content).toMatchObject({ id: event.id, pubkey: author, identifier: 'my-list' });
  });

  it('publishes an update of a list by the logged-in account', async () => {
    const update = LongFormContent.compose({
      identifier: 'my-list',
      title: 'New title',
      summary: '',
      notes: [],
      previous: publishedList()
    });

    const { publication } = await withClient((client) =>
      client.postLongFormContent(update, author)
    );

    expect(publication.acceptedRelays).toEqual(relays);
    expect(FakeWebSocket.sentEvents()[0]).toMatchObject({ kind: KIND.article, pubkey: author });
  });

  it('sends nothing for an update of a list by another account', async () => {
    const other = publicKeyOf('8'.repeat(64));
    const update = LongFormContent.compose({
      identifier: 'my-list',
      title: 'New title',
      summary: '',
      notes: [],
      previous: publishedList(other)
    });

    await expect(
      withClient((client) => client.postLongFormContent(update, other))
    ).rejects.toBeInstanceOf(SignedByAnotherAccountError);
    expect(FakeWebSocket.sentEvents()).toEqual([]);
  });

  it('sends nothing when the secret key is not that of the logged-in pubkey', async () => {
    pubkey.set(publicKeyOf('8'.repeat(64)));

    await expect(withClient((client) => client.postLongFormContent(newList()))).rejects.toThrow();
    expect(FakeWebSocket.sentEvents()).toEqual([]);
  });

  it('reports a relay that refuses the list, and publishes to the other', async () => {
    setRelayBehavior('wss://two.example', 'reject');

    const { publication } = await withClient((client) => client.postLongFormContent(newList()));

    expect(publication).toEqual({
      acceptedRelays: ['wss://one.example'],
      rejectedRelays: ['wss://two.example'],
      timedOutRelays: [],
      unavailableRelays: []
    });
  });

  it('fails when every relay refuses the list', async () => {
    relays.forEach((relay) => setRelayBehavior(relay, 'reject'));

    const failure = withClient((client) => client.postLongFormContent(newList()));

    await expect(failure).rejects.toBeInstanceOf(PublicationFailedError);
    await expect(failure).rejects.toMatchObject({
      result: { acceptedRelays: [], rejectedRelays: relays, timedOutRelays: [] }
    });
  });

  it('fails without signing when no relay connects', async () => {
    relays.forEach((relay) => setRelayBehavior(relay, 'refuse'));

    await expect(
      withClient((client) => client.postLongFormContent(newList()))
    ).rejects.toMatchObject({ result: { acceptedRelays: [], unavailableRelays: relays } });
    expect(FakeWebSocket.sentEvents()).toEqual([]);
  });
});

describe('NostrClient.deleteArticle with a secret key', () => {
  it('sends each relay a deletion request for the list, signed by its author', async () => {
    const list = publishedList();

    const publication = await withClient((client) => client.deleteArticle(list));

    expect(publication.acceptedRelays).toEqual(relays);
    const [event] = FakeWebSocket.instances[0].sentEvents();
    expect(isSigned(event)).toBe(true);
    expect(event).toMatchObject({ kind: KIND.deletion, pubkey: author });
    expect(event.tags).toEqual([
      ['e', list.id],
      ['a', `${KIND.article}:${author}:my-list`],
      ['k', `${KIND.article}`]
    ]);
  });
});

describe('NostrClient.postLongFormContent with a NIP-07 extension', () => {
  // An extension that signs with `key`, and gives the event as `give` makes it. Extensions give a
  // copy of the event, as JSON.
  const extension = (key: string, give = (event: Event) => event) => {
    const signEvent = vi.fn(async (event: EventTemplate) =>
      JSON.parse(JSON.stringify(give(signWith(key, event))))
    );
    vi.stubGlobal('window', { nostr: { getPublicKey: async () => publicKeyOf(key), signEvent } });
    pubkey.set('');
    seckey.set('');
    nip07.set(true);
    return signEvent;
  };

  it('publishes the list that the extension signed', async () => {
    const key = newSecretKey();
    extension(key);

    await withClient((client) => client.postLongFormContent(newList()));

    const [event] = FakeWebSocket.sentEvents();
    expect(isSigned(event)).toBe(true);
    expect(event.pubkey).toBe(publicKeyOf(key));
  });

  it('sends nothing when the signature of the extension is not valid', async () => {
    const forger = newSecretKey();
    // Signed by another key than the one that the event claims.
    extension(secret, (event) => ({ ...event, sig: signWith(forger, { ...event }).sig }));

    await expect(withClient((client) => client.postLongFormContent(newList()))).rejects.toThrow(
      'event is invalid'
    );
    expect(FakeWebSocket.sentEvents()).toEqual([]);
  });

  it('sends nothing when the extension gives an event without the fields of an event', async () => {
    extension(secret, (event) => ({ ...event, kind: String(event.kind) }) as unknown as Event);

    await expect(withClient((client) => client.postLongFormContent(newList()))).rejects.toThrow(
      'event is invalid'
    );
    expect(FakeWebSocket.sentEvents()).toEqual([]);
  });
});

describe('publishToRelays through nostr-tools', () => {
  const event = () => signWith(secret, { kind: KIND.text, content: '', created_at: 1, tags: [] });

  it('reports which relays accepted, refused, and did not answer', async () => {
    const urls = ['wss://ack.example', 'wss://reject.example', 'wss://silent.example'];
    setRelayBehavior('wss://reject.example', 'reject');
    setRelayBehavior('wss://silent.example', 'silent');
    const pool = await connectedPool(urls);

    try {
      await expect(publishToRelays(pool, urls, event(), 100)).resolves.toEqual({
        acceptedRelays: ['wss://ack.example'],
        rejectedRelays: ['wss://reject.example'],
        timedOutRelays: ['wss://silent.example'],
        unavailableRelays: []
      });
    } finally {
      pool.close(urls);
    }
  });

  it('takes a relay that drops the connection after getting the event as one that did not answer', async () => {
    const urls = ['wss://ack.example', 'wss://drop.example'];
    setRelayBehavior('wss://drop.example', 'drop');
    const pool = await connectedPool(urls);

    try {
      await expect(publishToRelays(pool, urls, event(), 100)).resolves.toMatchObject({
        acceptedRelays: ['wss://ack.example'],
        rejectedRelays: [],
        timedOutRelays: ['wss://drop.example']
      });
    } finally {
      pool.close(urls);
    }
  });

  it('fails when no relay answers before the timeout', async () => {
    setRelayBehavior('wss://silent.example', 'silent');
    const pool = await connectedPool(['wss://silent.example']);

    try {
      await expect(
        publishToRelays(pool, ['wss://silent.example'], event(), 100)
      ).rejects.toMatchObject({
        result: { acceptedRelays: [], rejectedRelays: [], timedOutRelays: ['wss://silent.example'] }
      });
    } finally {
      pool.close(['wss://silent.example']);
    }
  });
});
