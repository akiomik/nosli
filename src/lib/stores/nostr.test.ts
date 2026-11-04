import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom, from, first, map, mergeMap, toArray } from 'rxjs';
import { finishEvent, getPublicKey, Kind, type Event } from 'nostr-tools';
import type { RxNostr, RxReq } from 'rx-nostr';

import { matomeStore, recentGlobalMatomesStore, recentUserMatomesStore } from './nostr';

vi.mock('$lib/stores/cookie', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(undefined), seckey: writable(undefined) };
});

const authorKey = '1'.repeat(64);
const otherKey = '2'.repeat(64);
const author = getPublicKey(authorKey);
const now = 1_700_000_000;

const list = (identifier: string, createdAt: number, key = authorKey) =>
  finishEvent(
    {
      kind: Kind.Article,
      content: '',
      created_at: createdAt,
      tags: [
        ['d', identifier],
        ['title', identifier],
        ['t', 'nosli']
      ]
    },
    key
  );

const deletion = (tags: string[][], createdAt: number, key = authorKey) =>
  finishEvent({ kind: Kind.EventDeletion, content: '', created_at: createdAt, tags }, key);

const address = (event: Event) =>
  `${event.kind}:${event.pubkey}:${event.tags.find(([typ]) => typ === 'd')?.[1]}`;

type Filter = Record<string, number | string[] | number[]>;

const matches = (event: Event, filter: Filter) =>
  Object.entries(filter).every(([key, values]) => {
    if (key === 'limit') return true;
    if (!Array.isArray(values)) return false;
    if (key === 'kinds') return (values as number[]).includes(event.kind);
    if (key === 'authors') return (values as string[]).includes(event.pubkey);
    if (key === 'ids') return (values as string[]).includes(event.id);
    return event.tags.some(
      ([typ, value]) => `#${typ}` === key && (values as string[]).includes(value)
    );
  });

// Serves the events that match each request once, like a relay that answers and sends EOSE.
const fakeClient = (events: Event[]) =>
  ({
    use: (req: RxReq) =>
      req.getReqObservable().pipe(
        first((filters) => filters !== null),
        mergeMap((filters) =>
          from(events.filter((event) => (filters as Filter[]).some((f) => matches(event, f))))
        ),
        map((event) => ({ from: 'wss://relay.example.com', subId: 'sub', event }))
      )
  }) as unknown as RxNostr;

const identifiers = (lists: { identifier: string }[]) => lists.map(({ identifier }) => identifier);

describe('recentGlobalMatomesStore', () => {
  it('hides a list that its author deleted by its event or its address', async () => {
    const kept = list('kept', now);
    const deletedById = list('deleted-by-id', now);
    const deletedByAddress = list('deleted-by-address', now);
    const client = fakeClient([
      kept,
      deletedById,
      deletedByAddress,
      deletion([['e', deletedById.id]], now + 1),
      deletion([['a', address(deletedByAddress)]], now + 1)
    ]);

    const lists = await firstValueFrom(recentGlobalMatomesStore({ client, limit: 25 }));

    expect(identifiers(lists)).toEqual(['kept']);
  });

  it('ignores a deletion request from someone other than the author', async () => {
    const target = list('target', now);
    const client = fakeClient([
      target,
      deletion([['e', target.id]], now + 1, otherKey),
      deletion([['a', address(target)]], now + 1, otherKey)
    ]);

    const lists = await firstValueFrom(recentGlobalMatomesStore({ client, limit: 25 }));

    expect(identifiers(lists)).toEqual(['target']);
  });
});

describe('recentUserMatomesStore', () => {
  it('shows a list that was published again after its address was deleted', async () => {
    const deleted = list('deleted', now);
    const republished = list('republished', now + 10);
    const client = fakeClient([
      deleted,
      republished,
      deletion([['a', address(deleted)]], now + 5),
      deletion([['a', address(republished)]], now + 5)
    ]);

    const lists = await firstValueFrom(recentUserMatomesStore({ client, pubkey: author }));

    expect(identifiers(lists)).toEqual(['republished']);
  });
});

describe('matomeStore', () => {
  const params = { pubkey: author, identifier: 'my-list' };

  it('emits nothing for a deleted list', async () => {
    const target = list('my-list', now);
    const client = fakeClient([target, deletion([['a', address(target)]], now + 1)]);

    const lists = await firstValueFrom(matomeStore({ client, ...params }).pipe(toArray()));

    expect(lists).toEqual([]);
  });

  it('emits the newest version when only an older one was deleted', async () => {
    const older = list('my-list', now);
    const newer = list('my-list', now + 10);
    const client = fakeClient([older, newer, deletion([['e', older.id]], now + 5)]);

    const lists = await firstValueFrom(matomeStore({ client, ...params }).pipe(toArray()));

    expect(lists.map(({ id }) => id)).toEqual([newer.id]);
  });
});
