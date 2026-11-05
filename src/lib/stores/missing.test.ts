import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY, Subject, lastValueFrom, of, toArray } from 'rxjs';

import NostrClient from '#lib/services/NostrClient.js';
import { setRelayBehavior, setRelayEvents, socketsTo } from '#lib/testing/FakeWebSocket.js';
import { KIND, publicKeyOf, signWith } from '#lib/testing/nostr.js';
import { clientOf, disposeClients, eose, fakeClient, type RxNostr } from '#lib/testing/rxNostr.js';
import { matomeStore } from './nostr';
import { orMissing, retries, retryable, withEnd } from './missing';

vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

afterEach(() => {
  disposeClients();
});

describe('orMissing', () => {
  it('passes the values through, and adds nothing when there was one', async () => {
    const { client } = fakeClient();

    expect(await lastValueFrom(of(1, 2).pipe(orMissing(client), toArray()))).toEqual([1, 2]);
  });

  it('ends with not-found when a relay answered while the request ran', () => {
    const { client, messages } = fakeClient();
    const request = new Subject<number>();
    const emitted: unknown[] = [];
    request.pipe(orMissing(client)).subscribe((value) => emitted.push(value));

    messages.next(eose('wss://a'));
    request.complete();

    expect(emitted).toEqual(['not-found']);
  });

  it('ends with unreachable when no relay answered while the request ran', () => {
    const { client, messages } = fakeClient();
    messages.next(eose('wss://a'));
    const request = new Subject<number>();
    const emitted: unknown[] = [];
    request.pipe(orMissing(client)).subscribe((value) => emitted.push(value));

    request.complete();
    messages.next(eose('wss://a'));

    expect(emitted).toEqual(['unreachable']);
    expect(messages.observed).toBe(false);
  });
});

describe('withEnd', () => {
  it('marks each value as not ended, and the last one again as ended with the reason', () => {
    const { client, messages } = fakeClient();
    const request = new Subject<string>();
    const emitted: unknown[] = [];
    request.pipe(withEnd(client)).subscribe((value) => emitted.push(value));

    request.next('a');
    messages.next(eose('wss://a'));
    request.next('b');
    request.complete();

    expect(emitted).toEqual([
      { value: 'a', ended: false },
      { value: 'b', ended: false },
      { value: 'b', ended: true, reason: 'not-found' }
    ]);
    expect(messages.observed).toBe(false);
  });

  it('ends as unreachable when no relay answered', async () => {
    const { client } = fakeClient();

    expect(await lastValueFrom(of('a').pipe(withEnd(client), toArray()))).toEqual([
      { value: 'a', ended: false },
      { value: 'a', ended: true, reason: 'unreachable' }
    ]);
  });

  it('ends without a value when the request had none', async () => {
    const { client } = fakeClient();

    expect(await lastValueFrom(EMPTY.pipe(withEnd(client), toArray()))).toEqual([]);
  });
});

describe('retries', () => {
  const key = '7'.repeat(64);
  const list = signWith(key, {
    kind: KIND.article,
    content: '',
    created_at: 1,
    tags: [
      ['d', 'my-list'],
      ['title', 'My list'],
      ['t', NostrClient.TAG]
    ]
  });
  const findList = (client: RxNostr) =>
    matomeStore({ client, pubkey: publicKeyOf(key), identifier: 'my-list' }).pipe(
      orMissing(client)
    );
  const down = 'wss://down.example.com';
  const up = 'wss://up.example.com';

  it('connects again to the relays whose connection failed whatever the request is', async () => {
    setRelayBehavior(down, 'refuse');
    const client = clientOf([down]);
    await vi.waitFor(() => expect(socketsTo(down)[0]?.readyState).toBe(3));
    setRelayBehavior(down, 'ack');
    const shared = retries(client);
    shared.again(() => of('not a request to the relays')).subscribe();

    shared.retry();

    await vi.waitFor(() => expect(socketsTo(down)).toHaveLength(2));
  });

  it('connects again to the relays whose connection failed before each retry', async () => {
    setRelayBehavior(down, 'refuse');
    const client = clientOf([down, up]);
    const shared = retries(client);
    const found: unknown[] = [];
    shared.again(() => findList(client)).subscribe((value) => found.push(value));
    await vi.waitFor(() => expect(found).toEqual(['not-found']));

    // The relay comes up with the list.
    setRelayBehavior(down, 'ack');
    setRelayEvents(down, [list]);
    shared.retry();

    await vi.waitFor(() => expect(found).toHaveLength(2));
    expect(found[1]).toMatchObject({ id: list.id });
    // The relay that was up keeps its connection.
    expect(socketsTo(up)).toHaveLength(1);
  });

  it('finds the list once the relays that refused come up, on a retry', async () => {
    setRelayBehavior(down, 'refuse');
    setRelayBehavior(up, 'refuse');
    const client = clientOf([down, up]);
    const shared = retries(client);
    const found: unknown[] = [];
    shared.again(() => findList(client)).subscribe((value) => found.push(value));
    await vi.waitFor(() => expect(found).toEqual(['unreachable']), { timeout: 2000 });

    [down, up].forEach((relay) => {
      setRelayBehavior(relay, 'ack');
      setRelayEvents(relay, [list]);
    });
    shared.retry();

    await vi.waitFor(() => expect(found).toHaveLength(2));
    expect(found[1]).toMatchObject({ id: list.id });
  });
});

describe('retryable', () => {
  it('starts with undefined, and makes the request again from undefined on each retry', () => {
    let made = 0;
    const request = vi.fn(() => of(`answer ${++made}`));
    const store = retryable(request, retries(clientOf([])));
    const emitted: unknown[] = [];

    const subscription = store.subscribe((value) => emitted.push(value));
    store.retry();
    subscription.unsubscribe();

    expect(emitted).toEqual([undefined, 'answer 1', undefined, 'answer 2']);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('drops a request that is still running when it is made again', () => {
    const first = new Subject<string>();
    const store = retryable(
      vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(of('second')),
      retries(clientOf([]))
    );
    const emitted: unknown[] = [];

    store.subscribe((value) => emitted.push(value));
    store.retry();
    first.next('first, too late');

    expect(emitted).toEqual([undefined, undefined, 'second']);
  });

  it('makes the other requests of its retries again, keeping their values until new ones arrive', () => {
    const shared = retries(clientOf([]));
    const profiles = new Subject<string>();
    const list = retryable(() => of('list'), shared);
    const profile = shared.again(
      vi.fn().mockReturnValueOnce(of('profile')).mockReturnValue(profiles)
    );
    const lists: unknown[] = [];
    const shownProfiles: unknown[] = [];

    list.subscribe((value) => lists.push(value));
    profile.subscribe((value) => shownProfiles.push(value));
    list.retry();
    profiles.next('profile again');

    expect(lists).toEqual([undefined, 'list', undefined, 'list']);
    expect(shownProfiles).toEqual(['profile', 'profile again']);
  });
});
