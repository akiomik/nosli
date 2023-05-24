import { writable, derived } from 'svelte/store';
import type { Readable, Writable } from 'svelte/store';
import { delay, map, take, toArray } from 'rxjs';
import { RxBackwardReq, uniq, verify, latest, rxOneshotReq } from 'rx-nostr';
import type { RxNostr } from 'rx-nostr';
import { Kind } from 'nostr-tools';
import { sortedBy, takeTimeout, latestEachNaddr } from '$lib/stores/operators';
import NostrClient from '$lib/services/NostrClient';
import LongFormContent from '$lib/entities/LongFormContent';
import Profile from '$lib/entities/Profile';
import Note from '$lib/entities/Note';
import Reaction from '$lib/entities/Reaction';

// TODO: Return Readable or Observable
export function recentGlobalMatomesStore({
  client,
  limit,
  timeout = 500
}: {
  client: RxNostr;
  limit: number;
  timeout?: number;
}): Writable<LongFormContent[] | undefined> {
  const store = writable<LongFormContent[] | undefined>(undefined);

  const req = rxOneshotReq({
    filters: [
      {
        kinds: [Kind.Article],
        '#t': [NostrClient.TAG],
        limit
      }
    ]
  });

  client
    .use(req)
    .pipe(
      uniq(),
      verify(),
      takeTimeout(timeout),
      sortedBy(({ event }) => -event.created_at),
      latestEachNaddr(),
      map(({ event }) => LongFormContent.fromEvent(event)),
      toArray()
    )
    .subscribe(store.set);

  return store;
}

// TODO: Return Readable or Observable
export function recentUserMatomesStore({
  client,
  pubkey,
  timeout = 500
}: {
  client: RxNostr;
  pubkey: string;
  timeout?: number;
}): Writable<LongFormContent[] | undefined> {
  const store = writable<LongFormContent[] | undefined>(undefined);

  const req = rxOneshotReq({
    filters: [
      {
        kinds: [Kind.Article],
        authors: [pubkey],
        '#t': [NostrClient.TAG]
      }
    ]
  });

  client
    .use(req)
    .pipe(
      uniq(),
      verify(),
      takeTimeout(timeout),
      sortedBy(({ event }) => -event.created_at),
      latestEachNaddr(),
      map(({ event }) => LongFormContent.fromEvent(event)),
      toArray()
    )
    .subscribe(store.set);

  return store;
}

// TODO: Return Readable or Observable
export function matomeStore({
  client,
  pubkey,
  identifier,
  timeout = 500
}: {
  client: RxNostr;
  pubkey: string;
  identifier: string;
  timeout?: number;
}): Writable<LongFormContent | undefined> {
  const store = writable<LongFormContent | undefined>(undefined);

  const req = rxOneshotReq({
    filters: [
      {
        kinds: [Kind.Article],
        authors: [pubkey],
        '#d': [identifier],
        '#t': [NostrClient.TAG],
        limit: 1
      }
    ]
  });

  client
    .use(req)
    .pipe(
      verify(),
      latest(),
      takeTimeout(timeout),
      map(({ event }) => LongFormContent.fromEvent(event))
    )
    .subscribe(store.set);

  return store;
}

// TODO: Return Readable or Observable
export function profileStore({
  client,
  pubkey,
  timeout = 500
}: {
  client: RxNostr;
  pubkey: string;
  timeout?: number;
}): Writable<Profile | undefined> {
  const store = writable<Profile | undefined>(undefined);

  const req = rxOneshotReq({
    filters: [
      {
        kinds: [Kind.Metadata],
        authors: [pubkey],
        limit: 1
      }
    ]
  });

  client
    .use(req)
    .pipe(
      verify(),
      latest(),
      takeTimeout(timeout),
      map(({ event }) => Profile.fromEvent(event))
    )
    .subscribe(store.set);

  return store;
}

// TODO: Return Readable or Observable
export function notesStore({
  client,
  ids,
  timeout = 500
}: {
  client: RxNostr;
  ids: string[];
  timeout?: number;
}): Writable<(Note | undefined)[] | undefined> {
  const store = writable<(Note | undefined)[] | undefined>(undefined);
  const noteById: Record<string, Note> = {};

  const req = rxOneshotReq({
    filters: [
      {
        kinds: [Kind.Text],
        ids: ids
      }
    ]
  });

  client
    .use(req)
    .pipe(
      uniq(),
      verify(),
      takeTimeout(timeout),
      map(({ event }) => Note.fromEvent(event))
    )
    .subscribe((note) => {
      if (note.id === undefined) {
        return;
      }

      noteById[note.id] = note;
      store.set(ids.map((id) => noteById[id]));
    });

  return store;
}

export function noteStore({
  client,
  id,
  timeout = 500
}: {
  client: RxNostr;
  id: string;
  timeout?: number;
}): Writable<Note | undefined> {
  const store = writable<Note | undefined>(undefined);

  const req = rxOneshotReq({
    filters: [
      {
        kinds: [Kind.Text],
        ids: [id],
        limit: 1
      }
    ]
  });

  client
    .use(req)
    .pipe(
      uniq(),
      verify(),
      takeTimeout(timeout),
      map(({ event }) => Note.fromEvent(event))
    )
    .subscribe(store.set);

  return store;
}

// TODO: Return Readable or Observable
export function recentUserReactionsStore({
  client,
  pubkey,
  limit,
  timeout = 500
}: {
  client: RxNostr;
  pubkey: string;
  limit: number;
  timeout?: number;
}): Writable<Reaction[] | undefined> {
  const store = writable<Reaction[] | undefined>(undefined);

  const req = rxOneshotReq({
    filters: [
      {
        kinds: [Kind.Reaction],
        authors: [pubkey],
        limit
      }
    ]
  });

  client
    .use(req)
    .pipe(
      uniq(),
      verify(),
      takeTimeout(timeout),
      sortedBy(({ event }) => -event.created_at),
      take(limit),
      map(({ event }) => Reaction.fromEvent(event)),
      toArray()
    )
    .subscribe(store.set);

  return store;
}

// TODO: Return Readable or Observable
export function recentUserReactedNotesStore({
  client,
  pubkey,
  limit,
  timeout = 500
}: {
  client: RxNostr;
  pubkey: string;
  limit: number;
  timeout?: number;
}): Readable<(Note | undefined)[] | undefined> {
  return derived(
    recentUserReactionsStore({ client, pubkey, limit, timeout }),
    ($reactions, set) => {
      if ($reactions === undefined) {
        set(undefined);
        return;
      }

      const ids = $reactions.map((reaction) => reaction.eventId());
      notesStore({ client, ids, timeout }).subscribe(set);
    }
  );
}
