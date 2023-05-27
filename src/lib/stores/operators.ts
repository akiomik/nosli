import { map, pipe, mergeMap, toArray, from, timer, takeUntil, scan } from 'rxjs';
import type { MonoTypeOperatorFunction, OperatorFunction } from 'rxjs';
import { latestEach } from 'rx-nostr';
import type { EventPacket, ConnectionStatePacket } from 'rx-nostr';

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
  return latestEach(({ event }) => `${event.kind}:${event.pubkey}:${event.tags[0][1]}`);
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
