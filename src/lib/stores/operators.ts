import { map, pipe, mergeMap, toArray, from, timer, takeUntil } from 'rxjs';
import type { MonoTypeOperatorFunction } from 'rxjs';
import { latestEach } from 'rx-nostr';
import type { EventPacket } from 'rx-nostr';

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
  return latestEach(
    (packet) => `${packet.event.kind}:${packet.event.pubkey}:${packet.event.tags[0][1]}`
  );
}
