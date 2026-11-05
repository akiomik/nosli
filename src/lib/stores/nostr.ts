import {
  asapScheduler,
  concat,
  defaultIfEmpty,
  defer,
  distinctUntilChanged,
  filter,
  finalize,
  flatMap,
  ignoreElements,
  map,
  merge,
  of,
  scan,
  startWith,
  switchMap,
  take,
  timer,
  toArray
} from 'rxjs';
import type { Observable, OperatorFunction } from 'rxjs';
import { latest, createRxOneshotReq } from 'rx-nostr';
import type { RxNostr, ConnectionStatePacket, EventPacket } from 'rx-nostr';
import { kinds } from 'nostr-tools';
import type { Event, Filter } from 'nostr-tools';

import {
  requestedEvents,
  sortedBy,
  takeTimeout,
  hasNaddr,
  latestEachNaddr,
  latestConnectionState
} from '#lib/stores/operators.js';
import { createClient, reconnectFailedRelays } from '#lib/stores/client.js';
import NostrClient from '#lib/services/NostrClient.js';
import { normalizeRelayHint, relayHints } from '#lib/services/relayHints.js';
import { isEventId } from '#lib/entities/EventId.js';
import LongFormContent from '#lib/entities/LongFormContent.js';
import Profile from '#lib/entities/Profile.js';
import Note from '#lib/entities/Note.js';
import Reaction from '#lib/entities/Reaction.js';
import type { LoadingNote } from '#lib/entities/LoadingNote.js';

const DEFAULT_TIMEOUT_WITHOUT_SORT = 1000;
const DEFAULT_TIMEOUT_WITH_SORT = 750;
// Lists are shown before their deletion requests arrive, so waiting longer for them delays nothing.
const DEFAULT_DELETION_TIMEOUT = 5000;

// At most this many hinted relays are asked, so that a list cannot make a viewer open many sockets.
const MAX_HINTED_RELAYS = 8;

// The events that the relays of the client send for `filters`, until each relay has ended the
// request with EOSE or CLOSED, or is down. The relays whose connection failed are connected to again
// first, and asked once they are up. rx-nostr ends a request on the EOSE of its last relay before it
// passes that EOSE on to those who watch every message, as orMissing and withEnd do, so the request
// ends only once it has.
function request(client: RxNostr, filters: Filter[]): Observable<EventPacket> {
  return defer(() => {
    reconnectFailedRelays(client);
    return concat(
      client.use(createRxOneshotReq({ filters })),
      timer(0, asapScheduler).pipe(ignoreElements())
    );
  });
}

// Also asks the hinted relays that the client does not read from, up to MAX_HINTED_RELAYS of them in
// the order given. They get a client of their own that closes when the request ends, so a hint never
// joins the shared relays.
function requestWithRelayHints(
  client: RxNostr,
  filters: Filter[],
  relays: string[]
): Observable<EventPacket> {
  const hints = relayHints(relays);
  const known = new Set(
    hints.length > 0
      ? Object.values(client.getDefaultRelays({ filter: 'read-all' })).map(({ url }) =>
          normalizeRelayHint(url)
        )
      : []
  );
  const extra = hints.filter((url) => !known.has(url)).slice(0, MAX_HINTED_RELAYS);
  if (extra.length === 0) return request(client, filters);

  return defer(() => {
    const hinted = createClient(extra.map((url) => ({ url, read: true, write: false })));
    return merge(request(client, filters), request(hinted, filters)).pipe(
      finalize(() => hinted.dispose())
    );
  });
}

// The deletion requests that the authors send for the versions with these IDs, or for the lists at
// these addresses, starting with none and growing as they arrive.
function deletionRequests(
  client: RxNostr,
  { authors, ids, addresses }: { authors: string[]; ids: string[]; addresses: string[] },
  timeout: number
): Observable<Event[]> {
  const filters: Filter[] = [
    ...(ids.length > 0 ? [{ kinds: [kinds.EventDeletion], authors, '#e': ids }] : []),
    ...(addresses.length > 0 ? [{ kinds: [kinds.EventDeletion], authors, '#a': addresses }] : [])
  ];
  if (filters.length === 0) return of([]);

  return request(client, filters).pipe(
    requestedEvents(filters),
    takeTimeout(timeout),
    scan((requests: Event[], { event }) => [...requests, event], []),
    startWith([])
  );
}

// Shows the lists at once, and then hides each list whose author asks to delete it. A relay that
// missed the request, or ignores it, still serves the list, and NIP-09 asks clients to hide it.
function hidingDeleted(client: RxNostr): OperatorFunction<LongFormContent[], LongFormContent[]> {
  return switchMap((matomes) =>
    matomes.length === 0
      ? of(matomes)
      : deletionRequests(
          client,
          {
            authors: [...new Set(matomes.map(({ pubkey }) => pubkey))],
            ids: matomes.flatMap(({ id }) => (id ? [id] : [])),
            addresses: matomes.map((matome) => matome.address())
          },
          DEFAULT_DELETION_TIMEOUT
        ).pipe(
          map((requests) => matomes.filter((matome) => !matome.isDeletedBy(requests))),
          distinctUntilChanged((a, b) => a.length === b.length)
        )
  );
}

// The state of the connection to each relay that the client reads from or writes to, in the order
// that it was given.
export function relayConnectionsStore(client: RxNostr): Observable<ConnectionStatePacket[]> {
  return defer(() => {
    const status = client.getAllRelayStatus();
    const init: ConnectionStatePacket[] = Object.keys(client.getDefaultRelays()).map((url) => ({
      from: url,
      state: status[url]?.connection ?? 'initialized'
    }));

    return client
      .createConnectionStateObservable()
      .pipe(startWith(...init), latestConnectionState());
  });
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
  const filters: Filter[] = [
    {
      kinds: [kinds.LongFormArticle],
      '#t': [NostrClient.TAG],
      limit
    }
  ];

  return request(client, filters).pipe(
    requestedEvents(filters),
    filter(hasNaddr),
    takeTimeout(timeout),
    sortedBy(({ event }) => -event.created_at),
    latestEachNaddr(),
    map(({ event }) => LongFormContent.fromEvent(event)),
    toArray(),
    hidingDeleted(client)
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
  const filters: Filter[] = [
    {
      kinds: [kinds.LongFormArticle],
      authors: [pubkey],
      '#t': [NostrClient.TAG]
    }
  ];

  return request(client, filters).pipe(
    requestedEvents(filters),
    filter(hasNaddr),
    takeTimeout(timeout),
    sortedBy(({ event }) => -event.created_at),
    latestEachNaddr(),
    map(({ event }) => LongFormContent.fromEvent(event)),
    toArray(),
    hidingDeleted(client)
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
  const filters: Filter[] = [
    {
      kinds: [kinds.LongFormArticle],
      authors: [pubkey],
      '#d': [identifier],
      '#t': [NostrClient.TAG],
      limit: 1
    }
  ];

  return request(client, filters).pipe(
    requestedEvents(filters),
    latest(),
    takeTimeout(timeout),
    map(({ event }) => LongFormContent.fromEvent(event))
  );
}

// The deletion requests that the author of a list sends for the versions with these IDs, or for
// the list at these addresses, starting with none and growing as they arrive.
export function matomeDeletionRequestsStore({
  client,
  author,
  ids = [],
  addresses = [],
  timeout = DEFAULT_DELETION_TIMEOUT
}: {
  client: RxNostr;
  author: string;
  ids?: string[];
  addresses?: string[];
  timeout?: number;
}): Observable<Event[]> {
  return deletionRequests(client, { authors: [author], ids, addresses }, timeout);
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
  const filters: Filter[] = [
    {
      kinds: [kinds.Metadata],
      authors: [pubkey],
      limit: 1
    }
  ];

  return request(client, filters).pipe(
    requestedEvents(filters),
    // A profile that cannot be read is left out, as if it had not been sent, so it does not hide an
    // older one.
    filter(({ event }) => Profile.fromEvent(event) !== undefined),
    latest(),
    takeTimeout(timeout),
    map(({ event }) => Profile.fromEvent(event)),
    filter((profile): profile is Profile => profile !== undefined)
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

  const filters: Filter[] = [
    {
      kinds: [kinds.ShortTextNote],
      ids: ids
    }
  ];

  // A found note comes with the relay that returned it.
  return requestWithRelayHints(client, filters, relays).pipe(
    requestedEvents(filters),
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
  const filters: Filter[] = [
    {
      kinds: [kinds.ShortTextNote],
      ids: [id],
      limit: 1
    }
  ];

  return requestWithRelayHints(client, filters, relays).pipe(
    requestedEvents(filters),
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
  const filters: Filter[] = [
    {
      kinds: [kinds.Reaction],
      authors: [pubkey],
      limit
    }
  ];

  return request(client, filters).pipe(
    requestedEvents(filters),
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
