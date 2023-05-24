import { writable, derived } from 'svelte/store';
import type { Readable, Writable } from 'svelte/store';
import { delay, map, take, toArray } from 'rxjs';
import { RxBackwardReq, uniq, verify, latest, rxOneshotReq } from 'rx-nostr';
import type { RxNostr, EventPacket } from 'rx-nostr';
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
export function userMatomesStore({
  client,
  pubkey,
  delayTime = 500
}: {
  client: RxNostr;
  pubkey: string;
  delayTime?: number;
}): Writable<LongFormContent[] | undefined> {
  const store = writable<LongFormContent[] | undefined>(undefined);

  const req = new RxBackwardReq();
  req.emit([
    {
      kinds: [Kind.Article],
      authors: [pubkey],
      '#t': [NostrClient.TAG]
    }
  ]);

  // TODO: sort by created_at
  client
    .use(req.pipe(delay(delayTime)))
    .pipe(
      latestEachNaddr(),
      uniq(),
      verify(),
      map((envelope) => LongFormContent.fromEvent(envelope.event))
    )
    .subscribe((matome) => {
      store.update((matomes) => {
        if (matomes === undefined) {
          return [matome];
        } else {
          return [...matomes, matome];
        }
      });
    });

  return store;
}

// TODO: Return Readable or Observable
export function matomeStore({
  client,
  pubkey,
  identifier,
  delayTime = 500
}: {
  client: RxNostr;
  pubkey: string;
  identifier: string;
  delayTime?: number;
}): Writable<LongFormContent | undefined> {
  const store = writable<LongFormContent | undefined>(undefined);

  const req = new RxBackwardReq();
  req.emit([
    {
      kinds: [Kind.Article],
      authors: [pubkey],
      '#d': [identifier],
      '#t': [NostrClient.TAG],
      limit: 1
    }
  ]);

  client
    .use(req.pipe(delay(delayTime)))
    .pipe(
      verify(),
      latest(),
      map((envelope) => LongFormContent.fromEvent(envelope.event))
    )
    .subscribe((matome) => store.set(matome));

  return store;
}

// TODO: Return Readable or Observable
export function profileStore({
  client,
  pubkey,
  delayTime = 500
}: {
  client: RxNostr;
  pubkey: string;
  delayTime?: number;
}): Writable<Profile | undefined> {
  const store = writable<Profile | undefined>(undefined);

  const req = new RxBackwardReq();
  req.emit([
    {
      kinds: [Kind.Metadata],
      authors: [pubkey],
      limit: 1
    }
  ]);

  client
    .use(req.pipe(delay(delayTime)))
    .pipe(
      verify(),
      latest(),
      map((envelope) => Profile.fromEvent(envelope.event))
    )
    .subscribe((profile) => store.set(profile));

  return store;
}

// TODO: Return Readable or Observable
export function notesStore({
  client,
  ids,
  delayTime = 500
}: {
  client: RxNostr;
  ids: string[];
  delayTime?: number;
}): Writable<(Note | undefined)[] | undefined> {
  const store = writable<(Note | undefined)[] | undefined>(undefined);
  const noteById: Record<string, Note> = {};

  const req = new RxBackwardReq();
  req.emit([
    {
      kinds: [Kind.Text],
      ids: ids
    }
  ]);

  client
    .use(req.pipe(delay(delayTime)))
    .pipe(
      uniq(),
      verify(),
      map((envelope) => Note.fromEvent(envelope.event))
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
  delayTime = 500
}: {
  client: RxNostr;
  id: string;
  delayTime?: number;
}): Writable<Note | undefined> {
  const store = writable<Note | undefined>(undefined);

  const req = new RxBackwardReq();
  req.emit([
    {
      kinds: [Kind.Text],
      ids: [id],
      limit: 1
    }
  ]);

  client
    .use(req.pipe(delay(delayTime)))
    .pipe(
      uniq(),
      verify(),
      map((envelope) => Note.fromEvent(envelope.event))
    )
    .subscribe(store.set);

  return store;
}

// TODO: Return Readable or Observable
export function userReactionsStore({
  client,
  pubkey,
  limit,
  timeout = 500,
  sortKey = (packet: EventPacket) => -packet.event.created_at
}: {
  client: RxNostr;
  pubkey: string;
  limit: number;
  timeout?: number;
  sortKey?: (packet: EventPacket) => number;
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
      sortedBy(sortKey),
      take(limit),
      map((envelope) => Reaction.fromEvent(envelope.event)),
      toArray()
    )
    .subscribe(store.set);

  return store;
}

// TODO: Return Readable or Observable
export function userReactedNotesStore({
  client,
  pubkey,
  limit,
  timeout = 500,
  sortKey = (packet: EventPacket) => -packet.event.created_at
}: {
  client: RxNostr;
  pubkey: string;
  limit: number;
  timeout?: number;
  sortKey?: (packet: EventPacket) => number;
}): Readable<(Note | undefined)[] | undefined> {
  return derived(
    userReactionsStore({ client, pubkey, limit, timeout, sortKey }),
    ($reactions, set) => {
      if ($reactions === undefined) {
        set(undefined);
        return;
      }

      const ids = $reactions.map((reaction) => reaction.eventId());
      notesStore({ client, ids, delayTime: timeout }).subscribe(set);
    }
  );
}
