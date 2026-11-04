import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY, Subject, first, from, lastValueFrom, map, mergeMap, toArray } from 'rxjs';
import {
  createRxNostr,
  type ConnectionState,
  type ConnectionStatePacket,
  type RxNostr,
  type RxReq
} from 'rx-nostr';
import {
  finishEvent,
  generatePrivateKey,
  getPublicKey,
  Kind,
  matchFilters,
  signEvent,
  type Event,
  type Filter
} from 'nostr-tools';

import NostrClient from '#lib/services/NostrClient.js';
import {
  matomeStore,
  notesStore,
  noteStore,
  profileStore,
  recentGlobalMatomesStore,
  recentUserMatomesStore,
  recentUserReactionsStore
} from './nostr';

vi.mock('rx-nostr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('rx-nostr')>()),
  createRxNostr: vi.fn()
}));

vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

const key = '1'.repeat(64);
const note = (content: string) =>
  finishEvent({ kind: Kind.Text, content, created_at: 1, tags: [] }, key);

// A client that reads from `relays`, which hold `events`, and answers each request once. The state
// of each relay is `state`, and `states` reports changes to it.
const fakeClient = (relays: string[], events: Event[], state: ConnectionState = 'ongoing') => {
  const states = new Subject<ConnectionStatePacket>();
  const client = {
    state,
    states,
    setRelays: vi.fn(),
    dispose: vi.fn(),
    getRelays: () => relays.map((url) => ({ url, read: true, write: true })),
    getAllRelayState: () => Object.fromEntries(relays.map((url) => [url, client.state])),
    createConnectionStateObservable: () => states.asObservable(),
    use: vi.fn((req: RxReq) =>
      req.getReqObservable().pipe(
        first((filters) => filters !== null),
        mergeMap((filters) =>
          from(events.filter((event) => matchFilters(filters as Filter[], event)))
        ),
        map((event) => ({ from: relays[0], subId: 'sub', event }))
      )
    )
  };
  return client as typeof client & RxNostr;
};

// A client whose relays have nothing, so every request completes empty.
const emptyClient = () => {
  const client = { use: vi.fn(() => EMPTY) };
  return client as typeof client & RxNostr;
};

const contents = (notes: { note?: { content: string } }[]) =>
  notes.map(({ note }) => note?.content);

afterEach(() => {
  vi.mocked(createRxNostr).mockReset();
});

describe('notesStore', () => {
  it('lists every note as not found when no relay returns any of them', async () => {
    const ids = ['e'.repeat(64), 'f'.repeat(64)];

    const emitted = await lastValueFrom(notesStore({ client: emptyClient(), ids }).pipe(toArray()));

    expect(emitted).toEqual([ids.map((id) => ({ id, note: undefined }))]);
  });

  it('does not ask relays for notes when there are no IDs', async () => {
    const client = emptyClient();

    const emitted = await lastValueFrom(notesStore({ client, ids: [] }).pipe(toArray()));

    expect(emitted).toEqual([[]]);
    expect(client.use).not.toHaveBeenCalled();
  });

  it('also asks the hinted relays that the client lacks, through a client that then closes', async () => {
    const shared = note('on a shared relay');
    const hinted = note('only on a hinted relay');
    const client = fakeClient(['wss://shared.example.com/'], [shared]);
    const hintedClient = fakeClient(['wss://hint.example.com'], [hinted]);
    vi.mocked(createRxNostr).mockReturnValue(hintedClient);

    const notes = await lastValueFrom(
      notesStore({
        client,
        ids: [shared.id, hinted.id],
        relays: ['wss://shared.example.com', 'wss://hint.example.com']
      })
    );

    expect(contents(notes)).toEqual(['on a shared relay', 'only on a hinted relay']);
    expect(hintedClient.setRelays).toHaveBeenNthCalledWith(1, [
      { url: 'wss://hint.example.com', read: true, write: false }
    ]);
    expect(hintedClient.setRelays).toHaveBeenNthCalledWith(2, [
      { url: 'wss://hint.example.com', read: false, write: false }
    ]);
    expect(hintedClient.dispose).toHaveBeenCalled();
  });

  it('gives each found note the relay that returned it', async () => {
    const shared = note('on a shared relay');
    const hinted = note('only on a hinted relay');
    vi.mocked(createRxNostr).mockReturnValue(fakeClient(['wss://hint.example.com'], [hinted]));

    const notes = await lastValueFrom(
      notesStore({
        client: fakeClient(['wss://shared.example.com/'], [shared]),
        ids: [shared.id, hinted.id, 'f'.repeat(64)],
        relays: ['wss://hint.example.com']
      })
    );

    expect(notes.map(({ relays }) => relays)).toEqual([
      ['wss://shared.example.com'],
      ['wss://hint.example.com'],
      undefined
    ]);
  });

  it('does not open another client when the client already reads from every hinted relay', async () => {
    const shared = note('on a shared relay');
    const client = fakeClient(['wss://Shared.example.com/'], [shared]);

    await lastValueFrom(
      notesStore({ client, ids: [shared.id], relays: ['wss://shared.example.com'] })
    );

    expect(createRxNostr).not.toHaveBeenCalled();
  });

  it('asks at most 8 hinted relays, in the order given, and only valid ones', async () => {
    const hintedClient = fakeClient([], []);
    vi.mocked(createRxNostr).mockReturnValue(hintedClient);
    const relays = Array.from({ length: 10 }, (_, i) => `wss://h${i}.example.com`);

    await lastValueFrom(
      notesStore({
        client: fakeClient(['wss://shared.example.com'], []),
        ids: ['f'.repeat(64)],
        relays: ['ws://insecure.example.com', 'wss://localhost', ...relays]
      })
    );

    expect(hintedClient.setRelays).toHaveBeenNthCalledWith(
      1,
      relays.slice(0, 8).map((url) => ({ url, read: true, write: false }))
    );
  });

  it('keeps only notes that were asked for and whose ID is their hash', async () => {
    const genuine = note('genuine');
    const other = note('not asked for');
    // An attacker signs their own note but claims the ID of the genuine one.
    const attacker = generatePrivateKey();
    const unsigned = {
      kind: Kind.Text,
      content: 'forged',
      tags: [],
      created_at: 2,
      pubkey: getPublicKey(attacker)
    };
    const forged = { ...unsigned, id: genuine.id, sig: signEvent(unsigned, attacker) };
    // A hint relay sends the forged note and one that was not asked for, before the shared relays
    // send the genuine one.
    const client = fakeClient(['wss://shared.example.com'], []);
    const hintedClient = fakeClient(['wss://hint.example.com'], []);
    hintedClient.use.mockImplementation(() =>
      from(
        [forged, other].map((event) => ({ from: 'wss://hint.example.com', subId: 'sub', event }))
      )
    );
    client.use.mockImplementation(() =>
      from([{ from: 'wss://shared.example.com', subId: 'sub', event: genuine }])
    );
    vi.mocked(createRxNostr).mockReturnValue(hintedClient);

    const emitted = await lastValueFrom(
      notesStore({ client, ids: [genuine.id], relays: ['wss://hint.example.com'] }).pipe(toArray())
    );

    expect(emitted.map(contents)).toEqual([['genuine']]);
  });
});

describe('noteStore', () => {
  it('finds a note that only a hinted relay has, with that relay', async () => {
    const hinted = note('only on a hinted relay');
    const hintedClient = fakeClient(['wss://hint.example.com'], [hinted]);
    vi.mocked(createRxNostr).mockReturnValue(hintedClient);

    const found = await lastValueFrom(
      noteStore({
        client: fakeClient(['wss://shared.example.com'], []),
        id: hinted.id,
        relays: ['wss://hint.example.com']
      })
    );

    expect(found).toMatchObject({
      note: { content: 'only on a hinted relay' },
      relay: 'wss://hint.example.com'
    });
    expect(hintedClient.dispose).toHaveBeenCalled();
  });

  it('closes the hinted relays at once, and disposes their client once none is connecting', async () => {
    const hintedClient = fakeClient(['wss://hint.example.com'], [], 'starting');
    vi.mocked(createRxNostr).mockReturnValue(hintedClient);

    await lastValueFrom(
      noteStore({
        client: fakeClient(['wss://shared.example.com'], []),
        id: 'f'.repeat(64),
        relays: ['wss://hint.example.com']
      }).pipe(toArray())
    );

    expect(hintedClient.setRelays).toHaveBeenLastCalledWith([
      { url: 'wss://hint.example.com', read: false, write: false }
    ]);
    expect(hintedClient.dispose).not.toHaveBeenCalled();

    hintedClient.state = 'error';
    hintedClient.states.next({ from: 'wss://hint.example.com', state: 'error' });
    await new Promise((resolve) => setTimeout(resolve));

    expect(hintedClient.dispose).toHaveBeenCalledOnce();
  });
});

describe.each([
  {
    name: 'recentGlobalMatomesStore',
    read: (client: RxNostr) => recentGlobalMatomesStore({ client, limit: 10 })
  },
  {
    name: 'recentUserMatomesStore',
    read: (client: RxNostr, pubkey: string) => recentUserMatomesStore({ client, pubkey })
  }
])('$name', ({ read }) => {
  it('leaves out a list whose identifier is too long for an naddr', async () => {
    const key = generatePrivateKey();
    // 'あ' is 3 bytes in UTF-8.
    const list = (identifier: string) =>
      finishEvent(
        {
          kind: Kind.Article,
          content: '',
          created_at: 1,
          tags: [
            ['d', identifier],
            ['title', `${identifier.length}`],
            ['t', NostrClient.TAG]
          ]
        },
        key
      );
    const client = fakeClient(
      ['wss://shared.example.com'],
      [list('あ'.repeat(85)), list('あ'.repeat(86))]
    );
    const lists = await lastValueFrom(read(client, getPublicKey(key)));

    expect(lists.map(({ title }) => title)).toEqual(['85']);
    expect(lists[0].nip19Id()).toMatch(/^naddr1/);
  });
});

describe('profileStore', () => {
  const key = generatePrivateKey();
  const profile = (content: string, createdAt: number) =>
    finishEvent({ kind: Kind.Metadata, content, created_at: createdAt, tags: [] }, key);
  const names = async (events: Event[]) => {
    const client = fakeClient(['wss://shared.example.com'], events);
    const profiles = profileStore({ client, pubkey: getPublicKey(key) }).pipe(toArray());
    return (await lastValueFrom(profiles)).map(({ name }) => name);
  };

  it('does not let a newer profile that cannot be read hide an older one', async () => {
    const older = profile(JSON.stringify({ name: 'older' }), 1);

    expect(await names([older, profile('not JSON', 2), profile('null', 3)])).toEqual(['older']);
  });

  it('shows no profile when none can be read', async () => {
    expect(await names([profile('not JSON', 1), profile('[]', 2)])).toEqual([]);
  });
});

const author = generatePrivateKey();
const attacker = generatePrivateKey();
const nosliTag = ['t', NostrClient.TAG];

// For each store: how to make an event it asks for, labelled `label`, how to make one it does not
// ask for, and the labels of what it shows. The note stores ask for the IDs of `requested`.
const stores: {
  name: string;
  event: (label: string, key?: string, createdAt?: number) => Event;
  unrequested: () => Event;
  read: (client: RxNostr, requested: Event[]) => Promise<(string | undefined)[]>;
}[] = [
  {
    name: 'recentGlobalMatomesStore',
    event: (label, key = author, createdAt = 1) =>
      finishEvent(
        {
          kind: Kind.Article,
          content: '',
          created_at: createdAt,
          tags: [['d', label], ['title', label], nosliTag]
        },
        key
      ),
    // A list that another app published.
    unrequested: () =>
      finishEvent(
        { kind: Kind.Article, content: '', created_at: 2, tags: [['title', 'unrequested']] },
        author
      ),
    read: async (client) =>
      (await lastValueFrom(recentGlobalMatomesStore({ client, limit: 10 }))).map((l) => l.title)
  },
  {
    name: 'recentUserMatomesStore',
    event: (label, key = author, createdAt = 1) =>
      finishEvent(
        {
          kind: Kind.Article,
          content: '',
          created_at: createdAt,
          tags: [['d', label], ['title', label], nosliTag]
        },
        key
      ),
    // Another author's list.
    unrequested: () =>
      finishEvent(
        {
          kind: Kind.Article,
          content: '',
          created_at: 2,
          tags: [['d', 'unrequested'], ['title', 'unrequested'], nosliTag]
        },
        attacker
      ),
    read: async (client) =>
      (await lastValueFrom(recentUserMatomesStore({ client, pubkey: getPublicKey(author) }))).map(
        (l) => l.title
      )
  },
  {
    name: 'matomeStore',
    event: (label, key = author, createdAt = 1) =>
      finishEvent(
        {
          kind: Kind.Article,
          content: '',
          created_at: createdAt,
          tags: [['d', 'my-list'], ['title', label], nosliTag]
        },
        key
      ),
    // A newer list at the same identifier, by another author.
    unrequested: () =>
      finishEvent(
        {
          kind: Kind.Article,
          content: '',
          created_at: 2,
          tags: [['d', 'my-list'], ['title', 'unrequested'], nosliTag]
        },
        attacker
      ),
    read: async (client) => {
      const list = matomeStore({ client, pubkey: getPublicKey(author), identifier: 'my-list' });
      return [(await lastValueFrom(list)).title];
    }
  },
  {
    name: 'profileStore',
    event: (label, key = author, createdAt = 1) =>
      finishEvent(
        {
          kind: Kind.Metadata,
          content: JSON.stringify({ name: label }),
          created_at: createdAt,
          tags: []
        },
        key
      ),
    // A newer profile of another author.
    unrequested: () =>
      finishEvent(
        {
          kind: Kind.Metadata,
          content: JSON.stringify({ name: 'unrequested' }),
          created_at: 2,
          tags: []
        },
        attacker
      ),
    read: async (client) => [
      (await lastValueFrom(profileStore({ client, pubkey: getPublicKey(author) }))).name
    ]
  },
  {
    name: 'notesStore',
    event: (label, key = author, createdAt = 1) =>
      finishEvent({ kind: Kind.Text, content: label, created_at: createdAt, tags: [] }, key),
    unrequested: () =>
      finishEvent({ kind: Kind.Text, content: 'unrequested', created_at: 2, tags: [] }, author),
    read: async (client, requested) => {
      const ids = [...new Set(requested.map(({ id }) => id))];
      return contents(await lastValueFrom(notesStore({ client, ids }))).filter(Boolean);
    }
  },
  {
    name: 'noteStore',
    event: (label, key = author, createdAt = 1) =>
      finishEvent({ kind: Kind.Text, content: label, created_at: createdAt, tags: [] }, key),
    unrequested: () =>
      finishEvent({ kind: Kind.Text, content: 'unrequested', created_at: 2, tags: [] }, author),
    read: async (client, requested) => {
      const ids = [...new Set(requested.map(({ id }) => id))];
      const found = ids.map((id) => lastValueFrom(noteStore({ client, id }).pipe(toArray())));
      return (await Promise.all(found)).flat().map(({ note }) => note.content);
    }
  },
  {
    name: 'recentUserReactionsStore',
    event: (label, key = author, createdAt = 1) =>
      finishEvent(
        {
          kind: Kind.Reaction,
          content: label,
          created_at: createdAt,
          tags: [['e', 'e'.repeat(64)]]
        },
        key
      ),
    // Another author's reaction.
    unrequested: () =>
      finishEvent(
        {
          kind: Kind.Reaction,
          content: 'unrequested',
          created_at: 2,
          tags: [['e', 'e'.repeat(64)]]
        },
        attacker
      ),
    read: async (client) =>
      (
        await lastValueFrom(
          recentUserReactionsStore({ client, pubkey: getPublicKey(author), limit: 10 })
        )
      ).map((r) => r.content)
  }
];

describe.each(stores)('$name', ({ event, unrequested, read }) => {
  // A relay sends `before`, and then the genuine event.
  const show = (genuine: Event, before: unknown[], requested = [genuine]) => {
    const client = fakeClient(['wss://shared.example.com'], []);
    client.use.mockImplementation(() =>
      from(
        [...before, genuine].map((event) => ({
          from: 'wss://shared.example.com',
          subId: 'sub',
          event: event as Event
        }))
      )
    );
    return read(client, requested);
  };

  it('shows an event that more than one relay sends once', async () => {
    const genuine = event('genuine');

    expect(await show(genuine, [genuine])).toEqual(['genuine']);
  });

  it('skips events that are not objects', async () => {
    const genuine = event('genuine');

    expect(await show(genuine, [null, 'not an event', 1])).toEqual(['genuine']);
  });

  it('skips an event that it did not ask for', async () => {
    const genuine = event('genuine');

    expect(await show(genuine, [unrequested()])).toEqual(['genuine']);
  });

  it('skips an event that claims the ID of the real one', async () => {
    const genuine = event('genuine');
    // Another, newer event of the same author, under the ID of the genuine one.
    const forged = { ...event('forged', author, 2), id: genuine.id };

    expect(await show(genuine, [forged])).toEqual(['genuine']);
  });

  it('skips an event whose signature is wrong', async () => {
    const genuine = event('genuine');
    const unsigned = { ...event('unsigned', author, 2), sig: '0'.repeat(128) };

    expect(await show(genuine, [unsigned], [unsigned, genuine])).toEqual(['genuine']);
  });

  it('does not let a bad copy that arrives first hide the real event', async () => {
    const genuine = event('genuine');
    // The genuine event with another label, under its ID and signature.
    const { content, tags } = event('tampered');
    const tampered = { ...genuine, content, tags };
    const badSignature = { ...genuine, sig: '0'.repeat(128) };

    expect(await show(genuine, [tampered, badSignature])).toEqual(['genuine']);
  });
});
