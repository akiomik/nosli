import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastValueFrom, toArray } from 'rxjs';

import NostrClient from '#lib/services/NostrClient.js';
import {
  FakeWebSocket,
  requestsTo,
  setAnswerDelay,
  setOpenDelay,
  setRelayBehavior,
  setRelayEvents,
  socketsTo
} from '#lib/testing/FakeWebSocket.js';
import { KIND, newSecretKey, publicKeyOf, signWith, type Event } from '#lib/testing/nostr.js';
import { clientOf, disposeClients, type RxNostr } from '#lib/testing/rxNostr.js';
import {
  matomeDeletionRequestsStore,
  matomeStore,
  notesStore,
  noteStore,
  profileStore,
  recentGlobalMatomesStore,
  recentUserMatomesStore,
  recentUserReactionsStore
} from './nostr';

vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

const key = '1'.repeat(64);
const shared = 'wss://shared.example.com';
const hint = 'wss://hint.example.com';
const note = (content: string) =>
  signWith(key, { kind: KIND.text, content, created_at: 1, tags: [] });

// A client that reads from `relays`, fake ones that hold `events` and answer each request.
const fakeClient = (relays: string[], events: Event[]) => {
  relays.forEach((relay) => setRelayEvents(relay, events));
  return clientOf(relays);
};

// A client whose relays have nothing, so every request ends empty.
const emptyClient = () => clientOf([shared]);

const contents = (notes: { note?: { content: string } }[]) =>
  notes.map(({ note }) => note?.content);

afterEach(() => {
  disposeClients();
  vi.useRealTimers();
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
    expect(requestsTo(shared)).toEqual([]);
  });

  it('also asks the hinted relays that the client lacks, and then closes them', async () => {
    const onShared = note('on a shared relay');
    const onHint = note('only on a hinted relay');
    setRelayEvents(hint, [onHint]);
    const client = fakeClient([`${shared}/`], [onShared]);

    const notes = await lastValueFrom(
      notesStore({ client, ids: [onShared.id, onHint.id], relays: [shared, hint] })
    );

    expect(contents(notes)).toEqual(['on a shared relay', 'only on a hinted relay']);
    expect(requestsTo(hint)).toEqual([[{ kinds: [KIND.text], ids: [onShared.id, onHint.id] }]]);
    await vi.waitFor(() =>
      expect(socketsTo(hint).every(({ readyState }) => readyState === FakeWebSocket.CLOSED)).toBe(
        true
      )
    );
    // The shared relay stays open for other requests.
    expect(socketsTo(shared).map(({ readyState }) => readyState)).toEqual([FakeWebSocket.OPEN]);
  });

  it('gives each found note the relay that returned it', async () => {
    const onShared = note('on a shared relay');
    const onHint = note('only on a hinted relay');
    setRelayEvents(hint, [onHint]);

    const notes = await lastValueFrom(
      notesStore({
        client: fakeClient([`${shared}/`], [onShared]),
        ids: [onShared.id, onHint.id, 'f'.repeat(64)],
        relays: [hint]
      })
    );

    expect(notes.map(({ relays }) => relays)).toEqual([[shared], [hint], undefined]);
  });

  it('does not connect again to a hinted relay that the client already reads from', async () => {
    const onShared = note('on a shared relay');
    const client = fakeClient(['wss://Shared.example.com/'], [onShared]);

    await lastValueFrom(notesStore({ client, ids: [onShared.id], relays: [shared] }));

    expect(socketsTo(shared)).toHaveLength(1);
  });

  it('asks at most 8 hinted relays, in the order given, and only valid ones', async () => {
    const relays = Array.from({ length: 10 }, (_, i) => `wss://h${i}.example.com/`);

    await lastValueFrom(
      notesStore({
        client: emptyClient(),
        ids: ['f'.repeat(64)],
        relays: ['ws://insecure.example.com', 'wss://localhost', ...relays]
      })
    );

    expect(FakeWebSocket.instances.map(({ url }) => new URL(url).href)).toEqual([
      `${shared}/`,
      ...relays.slice(0, 8)
    ]);
  });

  it('keeps only notes that were asked for and whose ID is their hash', async () => {
    const genuine = note('genuine');
    const other = note('not asked for');
    // An attacker signs their own note but claims the ID of the genuine one.
    const attacker = newSecretKey();
    const unsigned = {
      kind: KIND.text,
      content: 'forged',
      tags: [],
      created_at: 2,
      pubkey: publicKeyOf(attacker)
    };
    const forged = { ...unsigned, id: genuine.id, sig: signWith(attacker, unsigned).sig };
    // A hint relay sends the forged note and one that was not asked for, before the shared relay
    // sends the genuine one.
    setRelayEvents(hint, [forged, other], { unfiltered: true });
    setAnswerDelay(shared, 20);
    const client = fakeClient([shared], [genuine]);

    const emitted = await lastValueFrom(
      notesStore({ client, ids: [genuine.id], relays: [hint] }).pipe(toArray())
    );

    expect(emitted.map(contents)).toEqual([['genuine']]);
  });
});

describe('noteStore', () => {
  it('finds a note that only a hinted relay has, with that relay', async () => {
    const onHint = note('only on a hinted relay');
    setRelayEvents(hint, [onHint]);

    const found = await lastValueFrom(
      noteStore({ client: emptyClient(), id: onHint.id, relays: [hint] })
    );

    expect(found).toMatchObject({ note: { content: 'only on a hinted relay' }, relay: hint });
    await vi.waitFor(() =>
      expect(socketsTo(hint).map(({ readyState }) => readyState)).toEqual([FakeWebSocket.CLOSED])
    );
  });

  it('closes a hinted relay that is still connecting when the request ends', async () => {
    setRelayBehavior(hint, 'hang');

    await lastValueFrom(
      noteStore({ client: emptyClient(), id: 'f'.repeat(64), relays: [hint] }).pipe(toArray())
    );

    await vi.waitFor(() =>
      expect(socketsTo(hint).every(({ readyState }) => readyState === FakeWebSocket.CLOSED)).toBe(
        true
      )
    );
  });

  // The test fails on an error that is thrown after it, too.
  it('ends without an error when a hinted relay fails to connect after the request ended', async () => {
    vi.useFakeTimers();
    setRelayBehavior(hint, 'refuse');
    setOpenDelay(hint, 2000);
    let ended = false;
    noteStore({ client: emptyClient(), id: 'f'.repeat(64), relays: [hint] }).subscribe({
      error: () => (ended = true),
      complete: () => (ended = true)
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(ended).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
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
    const key = newSecretKey();
    // 'あ' is 3 bytes in UTF-8.
    const list = (identifier: string) =>
      signWith(key, {
        kind: KIND.article,
        content: '',
        created_at: 1,
        tags: [
          ['d', identifier],
          ['title', `${identifier.length}`],
          ['t', NostrClient.TAG]
        ]
      });
    const client = fakeClient(
      ['wss://shared.example.com'],
      [list('あ'.repeat(85)), list('あ'.repeat(86))]
    );
    const lists = await lastValueFrom(read(client, publicKeyOf(key)));

    expect(lists.map(({ title }) => title)).toEqual(['85']);
    expect(lists[0].nip19Id()).toMatch(/^naddr1/);
  });
});

describe('profileStore', () => {
  const key = newSecretKey();
  const profile = (content: string, createdAt: number) =>
    signWith(key, { kind: KIND.metadata, content, created_at: createdAt, tags: [] });
  // Each relay has one of the events, as the request asks for the newest one only.
  const names = async (events: Event[]) => {
    const relays = events.map((event, i) => {
      setRelayEvents(`wss://r${i}.example.com`, [event]);
      return `wss://r${i}.example.com`;
    });
    const client = clientOf(relays);
    const profiles = profileStore({ client, pubkey: publicKeyOf(key) }).pipe(toArray());
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

const author = newSecretKey();
const attacker = newSecretKey();
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
      signWith(key, {
        kind: KIND.article,
        content: '',
        created_at: createdAt,
        tags: [['d', label], ['title', label], nosliTag]
      }),
    // A list that another app published.
    unrequested: () =>
      signWith(author, {
        kind: KIND.article,
        content: '',
        created_at: 2,
        tags: [['title', 'unrequested']]
      }),
    read: async (client) =>
      (await lastValueFrom(recentGlobalMatomesStore({ client, limit: 10 }))).map((l) => l.title)
  },
  {
    name: 'recentUserMatomesStore',
    event: (label, key = author, createdAt = 1) =>
      signWith(key, {
        kind: KIND.article,
        content: '',
        created_at: createdAt,
        tags: [['d', label], ['title', label], nosliTag]
      }),
    // Another author's list.
    unrequested: () =>
      signWith(attacker, {
        kind: KIND.article,
        content: '',
        created_at: 2,
        tags: [['d', 'unrequested'], ['title', 'unrequested'], nosliTag]
      }),
    read: async (client) =>
      (await lastValueFrom(recentUserMatomesStore({ client, pubkey: publicKeyOf(author) }))).map(
        (l) => l.title
      )
  },
  {
    name: 'matomeStore',
    event: (label, key = author, createdAt = 1) =>
      signWith(key, {
        kind: KIND.article,
        content: '',
        created_at: createdAt,
        tags: [['d', 'my-list'], ['title', label], nosliTag]
      }),
    // A newer list at the same identifier, by another author.
    unrequested: () =>
      signWith(attacker, {
        kind: KIND.article,
        content: '',
        created_at: 2,
        tags: [['d', 'my-list'], ['title', 'unrequested'], nosliTag]
      }),
    read: async (client) => {
      const list = matomeStore({ client, pubkey: publicKeyOf(author), identifier: 'my-list' });
      return [(await lastValueFrom(list)).title];
    }
  },
  {
    name: 'profileStore',
    event: (label, key = author, createdAt = 1) =>
      signWith(key, {
        kind: KIND.metadata,
        content: JSON.stringify({ name: label }),
        created_at: createdAt,
        tags: []
      }),
    // A newer profile of another author.
    unrequested: () =>
      signWith(attacker, {
        kind: KIND.metadata,
        content: JSON.stringify({ name: 'unrequested' }),
        created_at: 2,
        tags: []
      }),
    read: async (client) => [
      (await lastValueFrom(profileStore({ client, pubkey: publicKeyOf(author) }))).name
    ]
  },
  {
    name: 'notesStore',
    event: (label, key = author, createdAt = 1) =>
      signWith(key, { kind: KIND.text, content: label, created_at: createdAt, tags: [] }),
    unrequested: () =>
      signWith(author, { kind: KIND.text, content: 'unrequested', created_at: 2, tags: [] }),
    read: async (client, requested) => {
      const ids = [...new Set(requested.map(({ id }) => id))];
      return contents(await lastValueFrom(notesStore({ client, ids }))).filter(Boolean);
    }
  },
  {
    name: 'noteStore',
    event: (label, key = author, createdAt = 1) =>
      signWith(key, { kind: KIND.text, content: label, created_at: createdAt, tags: [] }),
    unrequested: () =>
      signWith(author, { kind: KIND.text, content: 'unrequested', created_at: 2, tags: [] }),
    read: async (client, requested) => {
      const ids = [...new Set(requested.map(({ id }) => id))];
      const found = ids.map((id) => lastValueFrom(noteStore({ client, id }).pipe(toArray())));
      return (await Promise.all(found)).flat().map(({ note }) => note.content);
    }
  },
  {
    name: 'recentUserReactionsStore',
    event: (label, key = author, createdAt = 1) =>
      signWith(key, {
        kind: KIND.reaction,
        content: label,
        created_at: createdAt,
        tags: [['e', 'e'.repeat(64)]]
      }),
    // Another author's reaction.
    unrequested: () =>
      signWith(attacker, {
        kind: KIND.reaction,
        content: 'unrequested',
        created_at: 2,
        tags: [['e', 'e'.repeat(64)]]
      }),
    read: async (client) =>
      (
        await lastValueFrom(
          recentUserReactionsStore({ client, pubkey: publicKeyOf(author), limit: 10 })
        )
      ).map((r) => r.content)
  }
];

describe.each(stores)('$name', ({ event, unrequested, read }) => {
  // A relay sends `before`, and then the genuine event, for every request.
  const show = (genuine: Event, before: unknown[], requested = [genuine]) => {
    setRelayEvents(shared, [...before, genuine], { unfiltered: true });
    return read(clientOf([shared]), requested);
  };

  it('shows an event that more than one relay sends once', async () => {
    const genuine = event('genuine');
    setRelayEvents(hint, [genuine]);

    expect(await read(fakeClient([shared, hint], [genuine]), [genuine])).toEqual(['genuine']);
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

describe('deleted lists', () => {
  const list = (identifier: string, createdAt = 10, key = author) =>
    signWith(key, {
      kind: KIND.article,
      content: '',
      created_at: createdAt,
      tags: [['d', identifier], ['title', identifier], nosliTag]
    });
  const deletion = (tags: string[][], createdAt = 20, key = author) =>
    signWith(key, { kind: KIND.deletion, content: '', created_at: createdAt, tags });
  const address = (identifier: string) => `${KIND.article}:${publicKeyOf(author)}:${identifier}`;
  const titles = (lists: { title: string }[][]) => lists.map((l) => l.map(({ title }) => title));
  const relay = 'wss://shared.example.com';

  describe.each([
    {
      name: 'recentGlobalMatomesStore',
      read: (client: RxNostr) => recentGlobalMatomesStore({ client, limit: 10 })
    },
    {
      name: 'recentUserMatomesStore',
      read: (client: RxNostr) => recentUserMatomesStore({ client, pubkey: publicKeyOf(author) })
    }
  ])('$name', ({ read }) => {
    const emitted = (events: Event[]) =>
      lastValueFrom(read(fakeClient([relay], events)).pipe(toArray()));

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows every list first, then hides those that their author deleted', async () => {
      const kept = list('kept', 13);
      const byId = list('by-id', 12);
      const byAddress = list('by-address', 11);
      const client = fakeClient(
        [relay],
        [
          kept,
          byId,
          byAddress,
          deletion([['e', byId.id]]),
          deletion([['a', address('by-address')]])
        ]
      );

      const lists = await lastValueFrom(read(client).pipe(toArray()));

      expect(titles(lists)[0]).toEqual(['kept', 'by-id', 'by-address']);
      expect(titles(lists).at(-1)).toEqual(['kept']);
      expect(requestsTo(relay).at(-1)).toEqual([
        {
          kinds: [KIND.deletion],
          authors: [publicKeyOf(author)],
          '#e': [kept.id, byId.id, byAddress.id]
        },
        {
          kinds: [KIND.deletion],
          authors: [publicKeyOf(author)],
          '#a': ['kept', 'by-id', 'by-address'].map(address)
        }
      ]);
    });

    it('shows the lists before deletion requests arrive, and waits 5 seconds for them', async () => {
      vi.useFakeTimers();
      const target = list('target');
      // Another relay has the deletion request, which it sends after a second, but never sends EOSE.
      const slow = 'wss://slow.example.com';
      setRelayBehavior(slow, 'stall');
      setAnswerDelay(slow, 1000);
      setRelayEvents(slow, [deletion([['e', target.id]])]);
      setRelayEvents(relay, [target]);
      const lists: string[][] = [];
      let completed = false;

      read(clientOf([relay, slow])).subscribe({
        next: (matomes) => lists.push(matomes.map(({ title }) => title)),
        complete: () => (completed = true)
      });
      // The request for the lists waits 750 ms for the slow relay.
      await vi.advanceTimersByTimeAsync(750);
      expect(lists).toEqual([['target']]);

      await vi.advanceTimersByTimeAsync(1000);
      expect(lists).toEqual([['target'], []]);

      await vi.advanceTimersByTimeAsync(3999);
      expect(completed).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(completed).toBe(true);
    });

    it('ignores a deletion request from someone other than the author', async () => {
      const target = list('target');
      const lists = await emitted([
        target,
        deletion([['e', target.id]], 20, attacker),
        deletion([['a', address('target')]], 20, attacker)
      ]);

      expect(titles(lists)).toEqual([['target']]);
    });

    it('keeps a list published again after its address was deleted', async () => {
      const lists = await emitted([list('again', 30), deletion([['a', address('again')]], 20)]);

      expect(titles(lists)).toEqual([['again']]);
    });

    it('does not ask for deletion requests when there are no lists', async () => {
      const client = emptyClient();

      expect(await lastValueFrom(read(client).pipe(toArray()))).toEqual([[]]);
      expect(requestsTo(shared)).toHaveLength(1);
    });
  });

  it("does not hide a list for another author's request among the authors of the lists", async () => {
    const mine = list('mine', 12);
    const theirs = list('theirs', 11, attacker);
    const client = fakeClient(
      [relay],
      [
        mine,
        theirs,
        deletion([['e', mine.id]], 20, attacker),
        deletion([['a', address('mine')]], 20, attacker)
      ]
    );

    const lists = await lastValueFrom(
      recentGlobalMatomesStore({ client, limit: 10 }).pipe(toArray())
    );

    expect(titles(lists)).toEqual([['mine', 'theirs']]);
  });

  describe('matomeDeletionRequestsStore', () => {
    it("gathers the author's requests for the IDs and addresses as they arrive", async () => {
      const version = list('my-list');
      const byId = deletion([['e', version.id]]);
      const byAddress = deletion([['a', address('my-list')]]);
      const client = fakeClient(
        [relay],
        [byId, deletion([['e', version.id]], 20, attacker), byAddress]
      );

      const emitted = await lastValueFrom(
        matomeDeletionRequestsStore({
          client,
          author: publicKeyOf(author),
          ids: [version.id],
          addresses: [address('my-list')]
        }).pipe(toArray())
      );

      expect(emitted.map((requests) => requests.map(({ id }) => id))).toEqual([
        [],
        [byId.id],
        [byId.id, byAddress.id]
      ]);
      expect(requestsTo(relay)).toEqual([
        [
          { kinds: [KIND.deletion], authors: [publicKeyOf(author)], '#e': [version.id] },
          {
            kinds: [KIND.deletion],
            authors: [publicKeyOf(author)],
            '#a': [address('my-list')]
          }
        ]
      ]);
    });

    it('asks only for what it is given, and for nothing without IDs or addresses', async () => {
      const client = fakeClient([relay], []);

      await lastValueFrom(
        matomeDeletionRequestsStore({
          client,
          author: publicKeyOf(author),
          addresses: [address('my-list')]
        })
      );
      const emitted = await lastValueFrom(
        matomeDeletionRequestsStore({ client, author: publicKeyOf(author) }).pipe(toArray())
      );

      expect(emitted).toEqual([[]]);
      expect(requestsTo(relay)).toEqual([
        [
          {
            kinds: [KIND.deletion],
            authors: [publicKeyOf(author)],
            '#a': [address('my-list')]
          }
        ]
      ]);
    });
  });
});
