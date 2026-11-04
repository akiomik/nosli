import { describe, expect, it, vi } from 'vitest';
import { EMPTY, Subject, lastValueFrom, of, toArray } from 'rxjs';
import type { ConnectionState, MessagePacket, Relay, RxNostr } from 'rx-nostr';

import { orMissing, retries, retryable, withEnd } from './missing';

// A client whose relays send `messages`, and are in these states.
const fakeClient = ({
  states = {},
  relays = []
}: { states?: Record<string, ConnectionState>; relays?: Relay[] } = {}) => {
  const messages = new Subject<MessagePacket>();
  const removeRelay = vi.fn();
  const addRelay = vi.fn();
  const client = {
    createAllMessageObservable: () => messages.asObservable(),
    getAllRelayState: () => states,
    getRelays: () => relays,
    removeRelay,
    addRelay
  } as unknown as RxNostr;
  return { client, messages, removeRelay, addRelay };
};
const eose = (from: string): MessagePacket => ({ from, message: ['EOSE', 'sub'] });

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
    const { client, messages } = fakeClient({ states: { 'wss://a': 'ongoing' } });
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
  it('adds the relays whose connection failed again, as they were, before each retry', () => {
    const failed = { url: 'wss://a/', read: true, write: false };
    const { client, removeRelay, addRelay } = fakeClient({
      states: { 'wss://a/': 'error', 'wss://b/': 'ongoing', 'wss://c/': 'starting' },
      relays: [
        failed,
        { url: 'wss://b/', read: true, write: true },
        { url: 'wss://c/', read: true, write: true }
      ]
    });
    const request = vi.fn(() => of('answer'));
    const shared = retries(client);
    shared.again(request).subscribe();

    shared.retry();

    expect(removeRelay.mock.calls).toEqual([['wss://a/']]);
    expect(addRelay.mock.calls).toEqual([[failed]]);
    expect(removeRelay.mock.invocationCallOrder[0]).toBeLessThan(
      request.mock.invocationCallOrder[1]
    );
  });
});

describe('retryable', () => {
  it('starts with undefined, and makes the request again from undefined on each retry', () => {
    let made = 0;
    const request = vi.fn(() => of(`answer ${++made}`));
    const store = retryable(request, retries(fakeClient().client));
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
      retries(fakeClient().client)
    );
    const emitted: unknown[] = [];

    store.subscribe((value) => emitted.push(value));
    store.retry();
    first.next('first, too late');

    expect(emitted).toEqual([undefined, undefined, 'second']);
  });

  it('makes the other requests of its retries again, keeping their values until new ones arrive', () => {
    const shared = retries(fakeClient().client);
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
