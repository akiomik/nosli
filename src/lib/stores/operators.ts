import { filter, map, pipe, mergeMap, toArray, from, timer, takeUntil, scan } from 'rxjs';
import type { MonoTypeOperatorFunction, OperatorFunction } from 'rxjs';
import { latestEach, verify } from 'rx-nostr';
import type { EventPacket, ConnectionStatePacket } from 'rx-nostr';
import { getEventHash, matchFilter, validateEvent } from 'nostr-tools';
import type { Event, Filter } from 'nostr-tools';

// As NIP-33 had it before it moved into NIP-01, an addressable event is at the value of its first d
// tag, or at '' without one.
const identifierOf = (event: Event): string => event.tags.find((tag) => tag[0] === 'd')?.[1] ?? '';

// Like matchFilters of nostr-tools, but the d tags of a filter are matched against the identifier of
// the event, and not against any of its d tags.
const matchesFilters = (filters: Filter[], event: Event): boolean =>
  filters.some(
    ({ '#d': identifiers, ...rest }) =>
      matchFilter(rest, event) &&
      (identifiers === undefined || identifiers.includes(identifierOf(event)))
  );

// A relay can answer with any event under any ID. Only the events that match the request's filters
// and whose ID is their hash are kept, and they are verified here, so that dropping duplicates after
// this does not let a bad copy that arrives first hide the real event.
export function requestedEvents(filters: Filter[]): MonoTypeOperatorFunction<EventPacket> {
  return pipe(
    filter(
      ({ event }) =>
        // A relay can send anything as the event, and reading a field of null throws.
        typeof event === 'object' &&
        event !== null &&
        validateEvent(event) &&
        getEventHash(event) === event.id &&
        matchesFilters(filters, event)
    ),
    verify()
  );
}

export function sorted<A>(f: (a: A, b: A) => number): MonoTypeOperatorFunction<A> {
  return pipe(
    toArray(),
    map((xs) => [...xs].sort(f)),
    mergeMap(from)
  );
}

export function sortedBy<A>(f: (a: A) => number): MonoTypeOperatorFunction<A> {
  return sorted((a, b) => f(a) - f(b));
}

export function takeTimeout<A>(timeout: number | Date): MonoTypeOperatorFunction<A> {
  return takeUntil(timer(timeout));
}

export function latestEachNaddr(): MonoTypeOperatorFunction<EventPacket> {
  return latestEach(({ event }) => `${event.kind}:${event.pubkey}:${identifierOf(event)}`);
}

export function scanArray<A>(): OperatorFunction<A, A[]> {
  return scan((acc: A[], a: A) => [...acc, a], []);
}

export function latestConnectionState(): OperatorFunction<
  ConnectionStatePacket,
  ConnectionStatePacket[]
> {
  return pipe(
    scanArray(),
    map((packets) => {
      const packetsByFrom: Record<string, ConnectionStatePacket[]> = {};

      packets.forEach((packet) => {
        if (packetsByFrom[packet.from] === undefined) {
          packetsByFrom[packet.from] = [];
        }

        packetsByFrom[packet.from].push(packet);
      });

      return Object.values(packetsByFrom).map((packets) => packets.slice(-1)[0]);
    })
  );
}
