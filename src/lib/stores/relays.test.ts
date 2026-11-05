import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Observable } from 'rxjs';

import NostrClient from '#lib/services/NostrClient.js';
import {
  FakeWebSocket,
  dropConnectionsOf,
  requestIdsTo,
  requestsTo,
  sendFrameFrom,
  setAnswerDelay,
  setRelayBehavior,
  setRelayEvents,
  socketsTo,
  type RelayBehavior
} from '#lib/testing/FakeWebSocket.js';
import { KIND, publicKeyOf, signWith } from '#lib/testing/nostr.js';
import { clientOf, disposeClients, statusOf, type RxNostr } from '#lib/testing/rxNostr.js';
import { reconnectWhenOnline } from './client';
import { orMissing, retries, withEnd } from './missing';
import {
  matomeDeletionRequestsStore,
  matomeStore,
  notesStore,
  noteStore,
  profileStore,
  recentGlobalMatomesStore,
  recentUserReactionsStore,
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
  it('connects to the relays at once, and keeps the connections between requests', async () => {
    const client = clientOf(relays);
    await vi.advanceTimersByTimeAsync(10);
    expect(relays.map((url) => socketsTo(url).map(({ readyState }) => readyState))).toEqual([
      [FakeWebSocket.OPEN],
      [FakeWebSocket.OPEN]
    ]);

    watch(findList(client));
    await vi.advanceTimersByTimeAsync(60_000);
    const later = watch(findList(client));
    await vi.advanceTimersByTimeAsync(10);

    expect(later.values).toEqual(['not-found']);
    expect(relays.map((url) => socketsTo(url).map(({ readyState }) => readyState))).toEqual([
      [FakeWebSocket.OPEN],
      [FakeWebSocket.OPEN]
    ]);
  });

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

describe('what changes with rx-nostr 3', () => {
  const deletions = (client: RxNostr) =>
    matomeDeletionRequestsStore({ client, author, ids: [list.id] }).pipe(withEnd(client));

  it.each<[RelayBehavior, string]>([
    ['drop', 'unreachable'],
    ['reject', 'not-found']
  ])(
    'ends the request for a list at once when every relay does this: %s',
    async (behavior, reason) => {
      behave(behavior);

      const request = watch(findList(clientOf(relays)));
      await vi.advanceTimersByTimeAsync(10);

      expect(request.values).toEqual([reason]);
      expect(request.endedAt).toBeLessThan(10);
    }
  );

  it.each<RelayBehavior>(['reject', 'drop'])(
    'does not wait for deletion requests from a relay that does this: %s',
    async (behavior) => {
      setRelayBehavior(a, behavior);
      setRelayEvents(b, [deletion]);

      const request = watch(deletions(clientOf(relays)));
      await vi.advanceTimersByTimeAsync(10);

      expect(request.values.at(-1)).toMatchObject({ value: [{ id: deletion.id }], ended: true });
      expect(request.endedAt).toBeLessThan(10);
    }
  );

  it('shows of two versions of a list dated the same the one with the lowest ID, as NIP-01 has it', async () => {
    const versions = ['one', 'two', 'three'].map((title) =>
      signWith(key, {
        kind: KIND.article,
        content: '',
        created_at: 10,
        tags: [
          ['d', 'my-list'],
          ['title', title],
          ['t', NostrClient.TAG]
        ]
      })
    );
    const lowest = [...versions].sort((x, y) => (x.id < y.id ? -1 : 1))[0];
    versions.forEach((version, i) => setRelayEvents(`wss://r${i}.example.com`, [version]));
    const client = clientOf(versions.map((_, i) => `wss://r${i}.example.com`));

    const request = watch(findList(client));
    const recent = watch(recentGlobalMatomesStore({ client, limit: 25 }));
    await vi.advanceTimersByTimeAsync(20);

    expect(request.values.at(-1)).toMatchObject({ id: lowest.id });
    expect(recent.values.at(-1)?.map(({ id }) => id)).toEqual([lowest.id]);
  });

  // rx-nostr 0.9 sent the request to a relay that had failed through a socket of its own, which
  // threw once the relay answered after it was added again.
  it('connects again on a retry to a relay that came up while a request to it ran', async () => {
    setRelayBehavior(b, 'refuse');
    setRelayEvents(b, [list]);
    const client = clientOf(relays);
    await vi.advanceTimersByTimeAsync(10);

    setRelayBehavior(b, 'ack');
    const shared = retries(client);
    const found = watch(shared.again(() => findList(client)));
    shared.retry();
    await vi.advanceTimersByTimeAsync(10);

    expect(found.values).toMatchObject([{ id: list.id }]);
  });

  it('lists the state of each relay when the list is opened after the relays connected', async () => {
    setRelayBehavior(b, 'refuse');
    const client = clientOf(relays);
    await vi.advanceTimersByTimeAsync(10);

    let listed: { from: string; status: string }[] = [];
    relayConnectionsStore(client).subscribe((packets) => {
      listed = packets.map(({ from, state }) => ({ from, status: statusOf(state) }));
    });

    expect(listed).toEqual([
      { from: a, status: 'connected' },
      { from: b, status: 'failed' }
    ]);
  });

  it('keeps answering from a relay that sent a frame that is not JSON', async () => {
    setRelayEvents(a, [list]);
    const client = clientOf([a]);
    await vi.advanceTimersByTimeAsync(10);

    sendFrameFrom(a, 'not JSON');
    const request = watch(findList(client));
    await vi.advanceTimersByTimeAsync(10);

    expect(request.values).toMatchObject([{ id: list.id }]);
  });

  it('leaves out a list that has expired, as NIP-40 has it', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiring = (title: string, expiration: number) =>
      signWith(key, {
        kind: KIND.article,
        content: '',
        created_at: 10,
        tags: [
          ['d', title],
          ['title', title],
          ['t', NostrClient.TAG],
          ['expiration', `${expiration}`]
        ]
      });
    setRelayEvents(a, [expiring('expired', now - 1), expiring('expiring', now + 60)]);

    const request = watch(recentGlobalMatomesStore({ client: clientOf(relays), limit: 25 }));
    await vi.advanceTimersByTimeAsync(20);

    expect(request.values.at(-1)?.map(({ title }) => title)).toEqual(['expiring']);
  });
});

describe('a relay whose connection failed', () => {
  const reaction = signWith(key, {
    kind: KIND.reaction,
    content: '+',
    created_at: 5,
    tags: [['e', 'f'.repeat(64)]]
  });
  const statusesOf = (client: RxNostr) => {
    let listed: string[] = [];
    relayConnectionsStore(client).subscribe((packets) => {
      listed = packets.map(({ state }) => statusOf(state));
    });
    return () => listed;
  };
  const browserOnline = new EventTarget();
  // The relays refuse while the client connects, then come up with what they hold.
  const failedThenUp = async (events: unknown[]) => {
    behave('refuse');
    const client = clientOf(relays);
    await vi.advanceTimersByTimeAsync(100);
    behave('ack');
    relays.forEach((url) => setRelayEvents(url, events));
    return client;
  };

  it('is connected to again, and answers, when a later request is made', async () => {
    const client = await failedThenUp([list]);

    const request = watch(findList(client));
    await vi.advanceTimersByTimeAsync(10);

    expect(request.values).toMatchObject([{ id: list.id }]);
    expect(request.endedAt).toBeLessThan(10);
    expect(relays.map((url) => socketsTo(url).length)).toEqual([2, 2]);
  });

  it('answers the requests that have no Try again, as for a profile or recent reactions', async () => {
    const client = await failedThenUp([profile, reaction]);

    const found = watch(profileStore({ client, pubkey: author }));
    const reactions = watch(recentUserReactionsStore({ client, pubkey: author, limit: 10 }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(found.values.at(-1)).toMatchObject({ name: 'alice' });
    expect(reactions.values.at(-1)).toHaveLength(1);
  });

  it('is connected to once for the requests that are made together', async () => {
    const client = await failedThenUp([list]);

    watch(findList(client));
    watch(profileStore({ client, pubkey: author }));
    watch(recentGlobalMatomesStore({ client, limit: 25 }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(relays.map((url) => socketsTo(url).length)).toEqual([2, 2]);
    // The list, the profile, the recent lists, and then the deletion requests for those.
    expect(relays.map((url) => requestsTo(url).length)).toEqual([4, 4]);
    expect(relays.map((url) => new Set(requestIdsTo(url)).size)).toEqual([4, 4]);
  });

  it('gets each request once on Try again', async () => {
    behave('refuse');
    const client = clientOf(relays);
    const shared = retries(client);
    const request = watch(shared.again(() => findList(client)));
    await vi.advanceTimersByTimeAsync(100);
    behave('ack');
    relays.forEach((url) => setRelayEvents(url, [list]));

    shared.retry();
    await vi.advanceTimersByTimeAsync(10);

    expect(request.values.at(-1)).toMatchObject({ id: list.id });
    expect(relays.map((url) => requestsTo(url).length)).toEqual([1, 1]);
  });

  it('gets each request once after the browser is back online', async () => {
    const client = await failedThenUp([list]);
    reconnectWhenOnline(client, browserOnline);

    browserOnline.dispatchEvent(new Event('online'));
    const request = watch(findList(client));
    await vi.advanceTimersByTimeAsync(10);

    expect(request.values).toMatchObject([{ id: list.id }]);
    expect(relays.map((url) => requestsTo(url).length)).toEqual([1, 1]);
  });

  it('ends a request as unreachable at once when it still refuses', async () => {
    behave('refuse');
    const client = clientOf(relays);
    await vi.advanceTimersByTimeAsync(100);

    const request = watch(findList(client));
    await vi.advanceTimersByTimeAsync(10);

    expect(request.values).toEqual(['unreachable']);
    expect(request.endedAt).toBeLessThan(10);
  });

  it('is connected to again when a later request is made after it dropped the connection', async () => {
    setRelayEvents(a, [list]);
    const client = clientOf([a]);
    await vi.advanceTimersByTimeAsync(10);
    dropConnectionsOf(a);
    await vi.advanceTimersByTimeAsync(10);

    const request = watch(findList(client));
    await vi.advanceTimersByTimeAsync(10);

    expect(request.values).toMatchObject([{ id: list.id }]);
    expect(socketsTo(a)).toHaveLength(2);
  });

  it('is not connected to again while nothing is asked', async () => {
    const client = await failedThenUp([list]);
    const current = statusesOf(client);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(current()).toEqual(['failed', 'failed']);
    expect(relays.map((url) => socketsTo(url).length)).toEqual([1, 1]);
  });

  it('is connected to again once the browser is back online, until that is stopped', async () => {
    const client = await failedThenUp([]);
    const current = statusesOf(client);
    const browser = new EventTarget();
    const stop = reconnectWhenOnline(client, browser);

    browser.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10);
    expect(current()).toEqual(['connected', 'connected']);

    stop();
    dropConnectionsOf(a);
    await vi.advanceTimersByTimeAsync(10);
    browser.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10);
    expect(current()).toEqual(['failed', 'connected']);
  });

  it('is connected to again when a later request is made after it closed the connection with 4000', async () => {
    setRelayEvents(a, [list]);
    const client = clientOf([a]);
    await vi.advanceTimersByTimeAsync(10);
    dropConnectionsOf(a, 4000);
    await vi.advanceTimersByTimeAsync(10);

    const request = watch(findList(client));
    await vi.advanceTimersByTimeAsync(10);

    expect(request.values).toMatchObject([{ id: list.id }]);
    expect(socketsTo(a)).toHaveLength(2);
  });
});

// rx-nostr closes connections with 4537 and 4538 itself, and a relay can send them too.
describe('a relay that closes the connection with a code of rx-nostr', () => {
  const missingNote = 'f'.repeat(64);
  const note = signWith(key, { kind: KIND.text, content: 'A note', created_at: 5, tags: [] });
  const hint = 'wss://hint.example.com';

  it.each([4537, 4538])(
    'is connected to again, and answers, when a later request is made: %s',
    async (code) => {
      setRelayEvents(a, [list]);
      const client = clientOf([a]);
      await vi.advanceTimersByTimeAsync(10);
      dropConnectionsOf(a, code);
      await vi.advanceTimersByTimeAsync(10);

      const request = watch(findList(client));
      await vi.advanceTimersByTimeAsync(10);

      expect(request.values).toMatchObject([{ id: list.id }]);
      expect(request.endedAt).toBeLessThan(10);
      expect(socketsTo(a)).toHaveLength(2);
    }
  );

  it.each([4537, 4538])(
    'does not keep a request to it from ending when it closes while asked: %s',
    async (code) => {
      setRelayBehavior(a, 'silent');
      const client = clientOf([a]);
      await vi.advanceTimersByTimeAsync(10);

      const request = watch(findList(client));
      await vi.advanceTimersByTimeAsync(10);
      dropConnectionsOf(a, code);
      await vi.advanceTimersByTimeAsync(1000);

      expect(request.values).toEqual(['unreachable']);
      expect(request.endedAt).toBeLessThan(20);
    }
  );

  it.each([4537, 4538])(
    'does not keep the notes of a list from ending when it is a hinted relay: %s',
    async (code) => {
      setRelayEvents(a, [note]);
      setRelayBehavior(hint, 'silent');
      const client = clientOf([a]);
      await vi.advanceTimersByTimeAsync(10);

      const request = watch(
        notesStore({ client, ids: [note.id, missingNote], relays: [hint] }).pipe(withEnd(client))
      );
      await vi.advanceTimersByTimeAsync(10);
      dropConnectionsOf(hint, code);
      await vi.advanceTimersByTimeAsync(1000);

      expect(request.values.at(-1)).toMatchObject({ ended: true });
      expect(request.values.at(-1)?.value.map(({ note }) => note?.id)).toEqual([
        note.id,
        undefined
      ]);
      expect(request.endedAt).toBeLessThanOrEqual(1000);
    }
  );
});

describe('a hinted relay that the browser does not open a socket to, as for a blocked port', () => {
  it('does not keep the notes found on the other relays from showing', async () => {
    const note = signWith(key, { kind: KIND.text, content: 'A note', created_at: 5, tags: [] });
    const blocked = 'wss://blocked.example.com:25';
    setRelayEvents(a, [note]);
    setRelayBehavior(blocked, 'throw');
    const client = clientOf([a]);
    await vi.advanceTimersByTimeAsync(10);

    const request = watch(
      notesStore({ client, ids: [note.id, 'f'.repeat(64)], relays: [blocked] }).pipe(
        withEnd(client)
      )
    );
    await vi.advanceTimersByTimeAsync(1000);

    expect(request.failed).toBe(false);
    expect(request.values.at(-1)).toMatchObject({ ended: true });
    expect(request.values.at(-1)?.value.map(({ note }) => note?.id)).toEqual([note.id, undefined]);
  });
});
