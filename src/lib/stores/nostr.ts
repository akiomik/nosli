import {
  defaultIfEmpty,
  defer,
  distinctUntilChanged,
  filter,
  finalize,
  flatMap,
  map,
  merge,
  of,
  scan,
  startWith,
  switchMap,
  take,
  toArray
} from 'rxjs';
import type { Observable, OperatorFunction } from 'rxjs';
import { latest, createRxNostr, createRxOneshotReq } from 'rx-nostr';
import type { RxNostr, RxReq, ConnectionStatePacket, EventPacket } from 'rx-nostr';
import { Kind } from 'nostr-tools';
import type { Event, Filter } from 'nostr-tools';

import {
  requestedEvents,
  sortedBy,
  takeTimeout,
  hasNaddr,
  latestEachNaddr,
  latestConnectionState
} from '#lib/stores/operators.js';
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

// The deletion requests that the authors send for the versions with these IDs, or for the lists at
// these addresses, starting with none and growing as they arrive.
function deletionRequests(
  client: RxNostr,
  { authors, ids, addresses }: { authors: string[]; ids: string[]; addresses: string[] },
  timeout: number
): Observable<Event[]> {
  const filters: Filter[] = [
    ...(ids.length > 0 ? [{ kinds: [Kind.EventDeletion], authors, '#e': ids }] : []),
    ...(addresses.length > 0 ? [{ kinds: [Kind.EventDeletion], authors, '#a': addresses }] : [])
  ];
  if (filters.length === 0) return of([]);

  return client.use(createRxOneshotReq({ filters })).pipe(
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
  const filters: Filter[] = [
    {
      kinds: [Kind.Article],
      '#t': [NostrClient.TAG],
      limit
    }
  ];

  return client.use(createRxOneshotReq({ filters })).pipe(
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
      kinds: [Kind.Article],
      authors: [pubkey],
      '#t': [NostrClient.TAG]
    }
  ];

  return client.use(createRxOneshotReq({ filters })).pipe(
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
      kinds: [Kind.Article],
      authors: [pubkey],
      '#d': [identifier],
      '#t': [NostrClient.TAG],
      limit: 1
    }
  ];

  return client.use(createRxOneshotReq({ filters })).pipe(
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
      kinds: [Kind.Metadata],
      authors: [pubkey],
      limit: 1
    }
  ];

  return client.use(createRxOneshotReq({ filters })).pipe(
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
      kinds: [Kind.Text],
      ids: ids
    }
  ];

  // A found note comes with the relay that returned it.
  return useWithRelayHints(client, () => createRxOneshotReq({ filters }), relays).pipe(
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
      kinds: [Kind.Text],
      ids: [id],
      limit: 1
    }
  ];

  return useWithRelayHints(client, () => createRxOneshotReq({ filters }), relays).pipe(
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
      kinds: [Kind.Reaction],
      authors: [pubkey],
      limit
    }
  ];

  return client.use(createRxOneshotReq({ filters })).pipe(
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
