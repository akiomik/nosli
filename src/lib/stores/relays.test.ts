import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Observable } from 'rxjs';

import NostrClient from '#lib/services/NostrClient.js';
import {
  dropConnectionsOf,
  setAnswerDelay,
  setRelayBehavior,
  setRelayEvents,
  socketsTo,
  type RelayBehavior
} from '#lib/testing/FakeWebSocket.js';
import { KIND, publicKeyOf, signWith } from '#lib/testing/nostr.js';
import { clientOf, disposeClients, statusOf, type RxNostr } from '#lib/testing/rxNostr.js';
import { orMissing, retries, withEnd } from './missing';
import {
  matomeDeletionRequestsStore,
  matomeStore,
  noteStore,
  profileStore,
  recentGlobalMatomesStore,
  relayConnectionsStore
} from './nostr';

// How the stores behave with relays that answer, fail or never answer, as the pages rely on it. Each
// test drives rx-nostr itself, against fake relays, with fake timers.

vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

const key = '7'.repeat(64);
const author = publicKeyOf(key);
const list = signWith(key, {
  kind: KIND.article,
  content: '',
  created_at: 10,
  tags: [
    ['d', 'my-list'],
    ['title', 'My list'],
    ['t', NostrClient.TAG]
  ]
});
const deletion = signWith(key, {
  kind: KIND.deletion,
  content: '',
  created_at: 20,
  tags: [['e', list.id]]
});
const profile = signWith(key, {
  kind: KIND.metadata,
  content: JSON.stringify({ name: 'alice' }),
  created_at: 1,
  tags: []
});
const relays = ['wss://a.example.com', 'wss://b.example.com'];
const [a, b] = relays;

const findList = (client: RxNostr) =>
  matomeStore({ client, pubkey: author, identifier: 'my-list' }).pipe(orMissing(client));

// What a request emits, and when, in milliseconds from when it was made, and when it ends.
const watch = <T>(request: Observable<T>) => {
  const start = Date.now();
  const watched = {
    values: [] as T[],
    times: [] as number[],
    endedAt: undefined as number | undefined,
    failed: false
  };
  request.subscribe({
    next: (value) => {
      watched.values.push(value);
      watched.times.push(Date.now() - start);
    },
    error: () => (watched.failed = true),
    complete: () => (watched.endedAt = Date.now() - start)
  });
  return watched;
};

const behave = (behavior: RelayBehavior, urls = relays) =>
  urls.forEach((url) => setRelayBehavior(url, behavior));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  disposeClients();
  vi.useRealTimers();
});

describe('the request for a list, as the list page makes it', () => {
  it('shows the list as soon as a relay sends it, and ends once every relay has answered', async () => {
    setRelayEvents(a, [list]);
    setAnswerDelay(b, 30);

    const request = watch(findList(clientOf(relays)));
    await vi.advanceTimersByTimeAsync(10);

    expect(request.values).toMatchObject([{ id: list.id }]);
    expect(request.endedAt).toBeUndefined();
    await vi.advanceTimersByTimeAsync(30);
    expect(request.endedAt).toBeLessThan(40);
  });

  it('ends as not found once every relay has answered without it', async () => {
    const request = watch(findList(clientOf(relays)));
    await vi.advanceTimersByTimeAsync(10);

    expect(request.values).toEqual(['not-found']);
    expect(request.endedAt).toBeLessThan(10);
  });

  it.each<RelayBehavior>(['silent', 'hang'])(
    'ends as unreachable after its 1 s wait when relays never answer (%s)',
    async (behavior) => {
      behave(behavior);

      const request = watch(findList(clientOf(relays)));
      await vi.advanceTimersByTimeAsync(999);
      expect(request.endedAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);

      expect(request.values).toEqual(['unreachable']);
      expect(request.endedAt).toBe(1000);
    }
  );

  it.each<[RelayBehavior, string]>([
    ['refuse', 'unreachable'],
    ['drop', 'unreachable'],
    ['reject', 'not-found']
  ])('ends within its 1 s wait when every relay does this: %s', async (behavior, reason) => {
    behave(behavior);

    const request = watch(findList(clientOf(relays)));
    await vi.advanceTimersByTimeAsync(1000);

    expect(request.values).toEqual([reason]);
    expect(request.endedAt).toBeLessThanOrEqual(1000);
  });

  it('ends as unreachable within its 1 s wait when every relay refused before', async () => {
    behave('refuse');
    const client = clientOf(relays);
    await vi.advanceTimersByTimeAsync(100);

    const request = watch(findList(client));
    await vi.advanceTimersByTimeAsync(1000);

    expect(request.values).toEqual(['unreachable']);
    expect(request.endedAt).toBeLessThanOrEqual(1000);
  });

  it('shows the list from a relay that is up while another refuses', async () => {
    setRelayBehavior(a, 'refuse');
    setRelayEvents(b, [list]);

    const request = watch(findList(clientOf(relays)));
    await vi.advanceTimersByTimeAsync(10);

    expect(request.values).toMatchObject([{ id: list.id }]);
    expect(request.endedAt).toBeLessThan(10);
  });

  it('shows the list from the relays that are up to a request made after another failed', async () => {
    setRelayBehavior(a, 'refuse');
    setRelayEvents(b, [list]);
    const client = clientOf(relays);
    await vi.advanceTimersByTimeAsync(100);

    const request = watch(findList(client));
    await vi.advanceTimersByTimeAsync(1000);

    expect(request.values).toMatchObject([{ id: list.id }]);
    expect(request.endedAt).toBeLessThanOrEqual(1000);
  });

  it('shows the list from the other relays when one drops its connection while asked', async () => {
    setRelayBehavior(a, 'silent');
    setRelayEvents(b, [list]);
    setAnswerDelay(b, 50);
    const client = clientOf(relays);
    await vi.advanceTimersByTimeAsync(10);

    const request = watch(findList(client));
    await vi.advanceTimersByTimeAsync(10);
    dropConnectionsOf(a);
    await vi.advanceTimersByTimeAsync(1000);

    expect(request.values).toMatchObject([{ id: list.id }]);
    expect(request.endedAt).toBeLessThanOrEqual(1000);
  });
});

describe('versions of a list', () => {
  const version = (title: string, createdAt: number) =>
    signWith(key, {
      kind: KIND.article,
      content: '',
      created_at: createdAt,
      tags: [
        ['d', 'my-list'],
        ['title', title],
        ['t', NostrClient.TAG]
      ]
    });

  it('shows the newest version that any relay holds', async () => {
    setRelayEvents(a, [version('older', 1)]);
    setRelayEvents(b, [version('newer', 2)]);
    setAnswerDelay(b, 20);

    const request = watch(findList(clientOf(relays)));
    await vi.advanceTimersByTimeAsync(30);

    expect(request.values.at(-1)).toMatchObject({ title: 'newer' });
    expect(request.endedAt).toBeDefined();
  });

  it('lists the newest version of each list once among recent lists', async () => {
    setRelayEvents(a, [version('older', 1)]);
    setRelayEvents(b, [version('newer', 2)]);

    const request = watch(recentGlobalMatomesStore({ client: clientOf(relays), limit: 25 }));
    await vi.advanceTimersByTimeAsync(30);

    expect(request.values.at(-1)?.map(({ title }) => title)).toEqual(['newer']);
  });
});

describe('the deletion requests for a list, as the edit page waits for them', () => {
  const deletions = (client: RxNostr) =>
    matomeDeletionRequestsStore({ client, author, ids: [list.id] }).pipe(withEnd(client));

  it('ends once every relay has answered', async () => {
    setRelayEvents(a, [deletion]);

    const request = watch(deletions(clientOf(relays)));
    await vi.advanceTimersByTimeAsync(10);

    expect(request.values.at(-1)).toMatchObject({
      value: [{ id: deletion.id }],
      ended: true,
      reason: 'not-found'
    });
    expect(request.endedAt).toBeLessThan(10);
  });

  it('waits 5 s for a relay that never answers', async () => {
    setRelayBehavior(a, 'silent');

    const request = watch(deletions(clientOf(relays)));
    await vi.advanceTimersByTimeAsync(4999);
    expect(request.endedAt).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(request.values.at(-1)).toEqual({ value: [], ended: true, reason: 'not-found' });
    expect(request.endedAt).toBe(5000);
  });

  it('gets a deletion request that a slow relay sends within the 5 s', async () => {
    setRelayEvents(a, [deletion]);
    setAnswerDelay(a, 2500);

    const request = watch(deletions(clientOf(relays)));
    await vi.advanceTimersByTimeAsync(2490);
    expect(request.values.at(-1)).toEqual({ value: [], ended: false });
    await vi.advanceTimersByTimeAsync(20);

    expect(request.values.at(-1)).toMatchObject({ value: [{ id: deletion.id }], ended: true });
    expect(request.endedAt).toBeLessThanOrEqual(2510);
  });

  it.each<RelayBehavior>(['refuse', 'reject', 'drop'])(
    'ends within the 5 s when a relay does this: %s',
    async (behavior) => {
      setRelayBehavior(a, behavior);
      setRelayEvents(b, [deletion]);

      const request = watch(deletions(clientOf(relays)));
      await vi.advanceTimersByTimeAsync(5000);

      expect(request.values.at(-1)).toMatchObject({ value: [{ id: deletion.id }], ended: true });
      expect(request.endedAt).toBeLessThanOrEqual(5000);
    }
  );
});

describe('recent lists, as home shows them', () => {
  const recent = (client: RxNostr) =>
    recentGlobalMatomesStore({ client, limit: 25 }).pipe(withEnd(client));

  it('shows the lists, then hides the deleted ones, and ends once every relay has answered', async () => {
    const kept = signWith(key, {
      kind: KIND.article,
      content: '',
      created_at: 5,
      tags: [
        ['d', 'kept'],
        ['t', NostrClient.TAG]
      ]
    });
    setRelayEvents(a, [list, kept, deletion]);

    const request = watch(recent(clientOf(relays)));
    await vi.advanceTimersByTimeAsync(20);

    expect(request.values.map(({ value }) => value.map(({ id }) => id))).toEqual([
      [list.id, kept.id],
      [kept.id],
      [kept.id]
    ]);
    expect(request.values.at(-1)).toMatchObject({ ended: true, reason: 'not-found' });
    expect(request.endedAt).toBeLessThan(20);
  });

  it('ends as unreachable after its 750 ms wait when relays never answer', async () => {
    behave('silent');

    const request = watch(recent(clientOf(relays)));
    await vi.advanceTimersByTimeAsync(749);
    expect(request.endedAt).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(request.values).toEqual([
      { value: [], ended: false },
      { value: [], ended: true, reason: 'unreachable' }
    ]);
    expect(request.endedAt).toBe(750);
  });

  it('ends as unreachable within its 750 ms wait when every relay refuses', async () => {
    behave('refuse');

    const request = watch(recent(clientOf(relays)));
    await vi.advanceTimersByTimeAsync(750);

    expect(request.values.at(-1)).toEqual({ value: [], ended: true, reason: 'unreachable' });
    expect(request.endedAt).toBeLessThanOrEqual(750);
  });
});

describe('a relay that sends what is not an event', () => {
  it('does not keep the list from showing, nor later requests from being answered', async () => {
    setRelayEvents(a, [
      null,
      'not an event',
      1,
      [],
      {},
      { id: 1, tags: 'not tags' },
      {
        ...list,
        tags: [
          ['d', 'my-list'],
          ['t', 1]
        ]
      },
      { ...list, sig: '0'.repeat(128) }
    ]);
    setRelayEvents(b, [list, profile]);
    const client = clientOf(relays);

    const first = watch(findList(client));
    await vi.advanceTimersByTimeAsync(10);
    const second = watch(profileStore({ client, pubkey: author }));
    await vi.advanceTimersByTimeAsync(10);

    expect(first).toMatchObject({ values: [{ id: list.id }], failed: false });
    expect(first.endedAt).toBeDefined();
    expect(second).toMatchObject({ values: [{ name: 'alice' }], failed: false });
  });
});

describe('relayConnectionsStore', () => {
  const statuses = (connections: ReturnType<typeof relayConnectionsStore>) => {
    let latest: { from: string; status: string }[] = [];
    connections.subscribe((packets) => {
      latest = packets.map(({ from, state }) => ({ from, status: statusOf(state) }));
    });
    return () => latest;
  };

  it('lists each relay once, in the order given, and tells which are connected', async () => {
    setRelayBehavior(b, 'refuse');
    const client = clientOf(relays);
    const current = statuses(relayConnectionsStore(client));
    await vi.advanceTimersByTimeAsync(10);

    expect(current()).toEqual([
      { from: a, status: 'connected' },
      { from: b, status: 'failed' }
    ]);
  });

  it('shows a relay that connects again on a retry as connected', async () => {
    setRelayBehavior(b, 'refuse');
    const client = clientOf(relays);
    const current = statuses(relayConnectionsStore(client));
    const shared = retries(client);
    shared.again(() => findList(client)).subscribe();
    await vi.advanceTimersByTimeAsync(10);

    setRelayBehavior(b, 'ack');
    shared.retry();
    await vi.advanceTimersByTimeAsync(10);

    expect(current()).toEqual([
      { from: a, status: 'connected' },
      { from: b, status: 'connected' }
    ]);
  });

  it('does not list the relays that a note hints at', async () => {
    const hint = 'wss://hint.example.com';
    const client = clientOf(relays);
    const current = statuses(relayConnectionsStore(client));

    noteStore({ client, id: 'f'.repeat(64), relays: [hint] }).subscribe();
    await vi.advanceTimersByTimeAsync(10);

    expect(socketsTo(hint)).toHaveLength(1);
    expect(current().map(({ from }) => from)).toEqual(relays);
  });
});

describe('the client', () => {
  it('makes no HTTP request, as for relay information', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    setRelayEvents(a, [list]);
    const client = clientOf(relays);

    watch(findList(client));
    watch(profileStore({ client, pubkey: author }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
