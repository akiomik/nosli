import type { Event, SimplePool } from 'nostr-tools';

export function publishToRelays(
  pool: Pick<SimplePool, 'publish'>,
  relays: string[],
  event: Event
): Promise<void> {
  // A single-relay call preserves the per-relay acknowledgment contract of
  // nostr-tools 1.6 even though 1.7 returns one Pub for the entire input list.
  const acknowledgments = relays.map(
    (relay) =>
      new Promise<void>((resolve, reject) => {
        const publication = pool.publish([relay], event);
        publication.on('ok', () => resolve());
        publication.on('failed', () => reject());
      })
  );

  return Promise.all(acknowledgments).then(() => undefined);
}
