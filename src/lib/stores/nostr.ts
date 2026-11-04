import {
  defaultIfEmpty,
  defer,
  filter,
  finalize,
  flatMap,
  map,
  merge,
  of,
  startWith,
  take,
  toArray
} from 'rxjs';
import type { Observable } from 'rxjs';
import { uniq, verify, latest, createRxNostr, createRxOneshotReq } from 'rx-nostr';
import type { RxNostr, RxReq, ConnectionStatePacket, EventPacket } from 'rx-nostr';
import { Kind, getEventHash, validateEvent } from 'nostr-tools';

import {
  sortedBy,
  takeTimeout,
  latestEachNaddr,
  latestConnectionState
} from '$lib/stores/operators';
import NostrClient from '$lib/services/NostrClient';
import { normalizeRelayHint, relayHints } from '$lib/services/relayHints';
import { isEventId } from '$lib/entities/EventId';
import LongFormContent from '$lib/entities/LongFormContent';
import Profile from '$lib/entities/Profile';
import Note from '$lib/entities/Note';
import Reaction from '$lib/entities/Reaction';
import type { LoadingNote } from '$lib/entities/LoadingNote';

const DEFAULT_TIMEOUT_WITHOUT_SORT = 1000;
const DEFAULT_TIMEOUT_WITH_SORT = 750;

// At most this many hinted relays are asked, so that a list cannot make a viewer open many sockets.
const MAX_HINTED_RELAYS = 8;

// Also asks the hinted relays that the client does not read from, up to MAX_HINTED_RELAYS of them in
// the order given. They get a client of their own that closes when the request ends, so a hint never
// joins the shared relays.
function useWithRelayHints(
  client: RxNostr,
  createReq: () => RxReq,
  relays: string[]
): Observable<EventPacket> {
  const hints = relayHints(relays);
  const known = new Set(
    hints.length > 0 ? client.getRelays().map(({ url }) => normalizeRelayHint(url)) : []
  );
  const extra = hints.filter((url) => !known.has(url)).slice(0, MAX_HINTED_RELAYS);
  if (extra.length === 0) return client.use(createReq());

  return defer(() => {
    const hinted = createRxNostr();
    hinted.setRelays(extra.map((url) => ({ url, read: true, write: false })));
    return merge(client.use(createReq()), hinted.use(createReq())).pipe(
      finalize(() => closeHintedClient(hinted))
    );
  });
}

// rx-nostr 0.9 throws when a socket that was still connecting reports its error after dispose(), so
// the relays are closed first, and the client is disposed once none of them is connecting.
function closeHintedClient(hinted: RxNostr) {
  const connecting = () =>
    Object.values(hinted.getAllRelayState()).some(
      (state) => state === 'starting' || state === 'reconnecting'
    );
  hinted.setRelays(hinted.getRelays().map(({ url }) => ({ url, read: false, write: false })));
  if (!connecting()) {
    hinted.dispose();
    return;
  }
  hinted
    .createConnectionStateObservable()
    .pipe(
      filter(() => !connecting()),
      take(1)
    )
    // The socket is still handling its error when the state changes, so dispose after it.
    .subscribe(() => setTimeout(() => hinted.dispose()));
}

// A relay can answer with any event under any ID. Only the requested notes whose ID is their hash
// are kept, and they are verified before duplicates are dropped, so that a bad copy that arrives
// first does not hide the real note.
const requestedNotes = (ids: string[]) => {
  const requested = new Set(ids);
  return filter(
    ({ event }: EventPacket) =>
      // A relay can send anything as the event, and reading a field of null throws.
      typeof event === 'object' &&
      event !== null &&
      event.kind === Kind.Text &&
      requested.has(event.id) &&
      validateEvent(event) &&
      getEventHash(event) === event.id
  );
};

export function relayConnectionsStore(client: RxNostr): Observable<ConnectionStatePacket[]> {
  const init: ConnectionStatePacket[] = client
    .getRelays()
    .map(({ url }) => ({ from: url, state: 'not-started' }));

  return client.createConnectionStateObservable().pipe(startWith(...init), latestConnectionState());
}

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
  relays = [],
  timeout = DEFAULT_TIMEOUT_WITHOUT_SORT
}: {
  client: RxNostr;
  ids: string[];
  relays?: string[];
  timeout?: number;
}): Observable<LoadingNote[]> {
  // A filter with no IDs would ask relays for every note.
  if (ids.length === 0) return of([]);

  const found: Record<string, LoadingNote> = {};

  const createReq = () =>
    createRxOneshotReq({
      filters: [
        {
          kinds: [Kind.Text],
          ids: ids
        }
      ]
    });

  // A found note comes with the relay that returned it.
  return useWithRelayHints(client, createReq, relays).pipe(
    requestedNotes(ids),
    verify(),
    uniq(),
    takeTimeout(timeout),
    map(({ event, from }) => {
      found[event.id] = { id: event.id, note: Note.fromEvent(event), relays: relayHints([from]) };
      return ids.map((id) => found[id] ?? { id, note: undefined });
    }),
    // Lists every note as not found when no relay returns any of them.
    defaultIfEmpty(ids.map((id) => ({ id, note: undefined })))
  );
}

// Emits the note with the relay that returned it.
export function noteStore({
  client,
  id,
  relays = [],
  timeout = DEFAULT_TIMEOUT_WITHOUT_SORT
}: {
  client: RxNostr;
  id: string;
  relays?: string[];
  timeout?: number;
}): Observable<{ note: Note; relay: string }> {
  const createReq = () =>
    createRxOneshotReq({
      filters: [
        {
          kinds: [Kind.Text],
          ids: [id],
          limit: 1
        }
      ]
    });

  return useWithRelayHints(client, createReq, relays).pipe(
    requestedNotes([id]),
    verify(),
    uniq(),
    takeTimeout(timeout),
    map(({ event, from }) => ({ note: Note.fromEvent(event), relay: from }))
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
      // Lists each note once, however many reactions point to it, and skips reactions that do not
      // point to an event ID.
      const ids = [...new Set(reactions.flatMap((r) => r.eventId() ?? []))].filter(isEventId);
      return notesStore({ client, ids, timeout });
    })
  );
}
