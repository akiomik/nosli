import {
  defer,
  filter,
  map,
  pipe,
  mergeMap,
  tap,
  toArray,
  from,
  timer,
  takeUntil,
  scan
} from 'rxjs';
import type { MonoTypeOperatorFunction, OperatorFunction } from 'rxjs';
import { latestEach, verify } from 'rx-nostr';
import type { EventPacket, ConnectionStatePacket } from 'rx-nostr';
import { getEventHash, matchFilter, validateEvent } from 'nostr-tools';
import type { Event, Filter } from 'nostr-tools';

// As NIP-33 had it before it moved into NIP-01, an addressable event is at the value of its first d
// tag, or at '' without one.
const identifierOf = (event: Event): string => event.tags.find((tag) => tag[0] === 'd')?.[1] ?? '';

// Like matchFilters of nostr-tools, but the d tags of a filter are matched against the identifier of
// the event, and not against any of its d tags. Only filters for addressable kinds have d tags here.
const matchesFilters = (filters: Filter[], event: Event): boolean =>
  filters.some(
    ({ '#d': identifiers, ...rest }) =>
      matchFilter(rest, event) &&
      (identifiers === undefined || identifiers.includes(identifierOf(event)))
  );

// A Date holds at most this many seconds either side of 1970, and showing one beyond them throws.
const MAX_DATE_SECONDS = 8.64e12;

// A relay can send anything as the event, and reading a field of null throws. NIP-01 tags hold only
// strings, which validateEvent of nostr-tools does not check, and neither does it check that
// created_at fits in a Date.
const isEvent = (event: unknown): event is Event =>
  typeof event === 'object' &&
  event !== null &&
  validateEvent(event as Event) &&
  Math.abs((event as Event).created_at) <= MAX_DATE_SECONDS &&
  (event as Event).tags.every((tag) => tag.every((value) => typeof value === 'string'));

// A relay can answer with any event under any ID. Keeps each event that matches the request's
// filters, whose ID is its hash, and whose signature is valid, once. A bad copy that arrives first is
// dropped, so it does not hide the real event.
export function requestedEvents(filters: Filter[]): MonoTypeOperatorFunction<EventPacket> {
  return (packets) =>
    defer(() => {
      // Once an event is verified, any later copy with its ID is dropped without checking it again.
      const verified = new Set<string>();
      return packets.pipe(
        filter(
          ({ event }) =>
            isEvent(event) &&
            !verified.has(event.id) &&
            getEventHash(event) === event.id &&
            matchesFilters(filters, event)
        ),
        verify(),
        tap(({ event }) => verified.add(event.id))
      );
    });
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
