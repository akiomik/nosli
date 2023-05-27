import { map, take, toArray, flatMap } from 'rxjs';
import type { Observable } from 'rxjs';
import { uniq, verify, latest, createRxOneshotReq } from 'rx-nostr';
import type { RxNostr } from 'rx-nostr';
import { Kind } from 'nostr-tools';

import { sortedBy, takeTimeout, latestEachNaddr } from '$lib/stores/operators';
import NostrClient from '$lib/services/NostrClient';
import LongFormContent from '$lib/entities/LongFormContent';
import Profile from '$lib/entities/Profile';
import Note from '$lib/entities/Note';
import Reaction from '$lib/entities/Reaction';
import type { LoadingNote } from '$lib/entities/LoadingNote';

const DEFAULT_TIMEOUT_WITHOUT_SORT = 1000;
const DEFAULT_TIMEOUT_WITH_SORT = 750;

export function recentGlobalMatomesStore({
  client,
  limit,
  timeout = DEFAULT_TIMEOUT_WITH_SORT
}: {
  client: RxNostr;
  limit: number;
  timeout?: number;
}): Observable<LongFormContent[]> {
  const req = createRxOneshotReq({
    filters: [
      {
        kinds: [Kind.Article],
        '#t': [NostrClient.TAG],
        limit
      }
    ]
  });

  return client.use(req).pipe(
    uniq(),
    verify(),
    takeTimeout(timeout),
    sortedBy(({ event }) => -event.created_at),
    latestEachNaddr(),
    map(({ event }) => LongFormContent.fromEvent(event)),
    toArray()
  );
}

export function recentUserMatomesStore({
  client,
  pubkey,
  timeout = DEFAULT_TIMEOUT_WITH_SORT
}: {
  client: RxNostr;
  pubkey: string;
  timeout?: number;
}): Observable<LongFormContent[]> {
  const req = createRxOneshotReq({
    filters: [
      {
        kinds: [Kind.Article],
        authors: [pubkey],
        '#t': [NostrClient.TAG]
      }
    ]
  });

  return client.use(req).pipe(
    uniq(),
    verify(),
    takeTimeout(timeout),
    sortedBy(({ event }) => -event.created_at),
    latestEachNaddr(),
    map(({ event }) => LongFormContent.fromEvent(event)),
    toArray()
  );
}

export function matomeStore({
  client,
  pubkey,
  identifier,
  timeout = DEFAULT_TIMEOUT_WITHOUT_SORT
}: {
  client: RxNostr;
  pubkey: string;
  identifier: string;
  timeout?: number;
}): Observable<LongFormContent> {
  const req = createRxOneshotReq({
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

  return client.use(req).pipe(
    verify(),
    latest(),
    takeTimeout(timeout),
    map(({ event }) => LongFormContent.fromEvent(event))
  );
}

// TODO: Return Readable or Observable
export function profileStore({
  client,
  pubkey,
  timeout = DEFAULT_TIMEOUT_WITHOUT_SORT
}: {
  client: RxNostr;
  pubkey: string;
  timeout?: number;
}): Observable<Profile> {
  const req = createRxOneshotReq({
    filters: [
      {
        kinds: [Kind.Metadata],
        authors: [pubkey],
        limit: 1
      }
    ]
  });

  return client.use(req).pipe(
    verify(),
    latest(),
    takeTimeout(timeout),
    map(({ event }) => Profile.fromEvent(event))
  );
}

export function notesStore({
  client,
  ids,
  timeout = DEFAULT_TIMEOUT_WITHOUT_SORT
}: {
  client: RxNostr;
  ids: string[];
  timeout?: number;
}): Observable<LoadingNote[]> {
  const noteById: Record<string, Note> = {};

  const req = createRxOneshotReq({
    filters: [
      {
        kinds: [Kind.Text],
        ids: ids
      }
    ]
  });

  return client.use(req).pipe(
    uniq(),
    verify(),
    takeTimeout(timeout),
    map(({ event }) => {
      const note = Note.fromEvent(event);
      noteById[event.id] = note;
      return ids.map((id) => ({ id, note: noteById[id] }));
    })
  );
}

export function noteStore({
  client,
  id,
  timeout = DEFAULT_TIMEOUT_WITHOUT_SORT
}: {
  client: RxNostr;
  id: string;
  timeout?: number;
}): Observable<Note> {
  const req = createRxOneshotReq({
    filters: [
      {
        kinds: [Kind.Text],
        ids: [id],
        limit: 1
      }
    ]
  });

  return client.use(req).pipe(
    uniq(),
    verify(),
    takeTimeout(timeout),
    map(({ event }) => Note.fromEvent(event))
  );
}

export function recentUserReactionsStore({
  client,
  pubkey,
  limit,
  timeout = DEFAULT_TIMEOUT_WITH_SORT
}: {
  client: RxNostr;
  pubkey: string;
  limit: number;
  timeout?: number;
}): Observable<Reaction[]> {
  const req = createRxOneshotReq({
    filters: [
      {
        kinds: [Kind.Reaction],
        authors: [pubkey],
        limit
      }
    ]
  });

  return client.use(req).pipe(
    uniq(),
    verify(),
    takeTimeout(timeout),
    sortedBy(({ event }) => -event.created_at),
    take(limit),
    map(({ event }) => Reaction.fromEvent(event)),
    toArray()
  );
}

export function recentUserReactedNotesStore({
  client,
  pubkey,
  limit,
  timeout = DEFAULT_TIMEOUT_WITH_SORT
}: {
  client: RxNostr;
  pubkey: string;
  limit: number;
  timeout?: number;
}): Observable<LoadingNote[]> {
  return recentUserReactionsStore({ client, pubkey, limit, timeout }).pipe(
    flatMap((reactions) => {
      const ids = reactions.map((reaction) => reaction.eventId());
      return notesStore({ client, ids, timeout });
    })
  );
}
