import type { Event, SimplePool } from 'nostr-tools';

export type PublicationResult = {
  acceptedRelays: string[];
  rejectedRelays: string[];
  timedOutRelays: string[];
  unavailableRelays: string[];
};

export const emptyPublicationResult = (): PublicationResult => ({
  acceptedRelays: [],
  rejectedRelays: [],
  timedOutRelays: [],
  unavailableRelays: []
});

export class PublicationFailedError extends Error {
  constructor(public readonly result: PublicationResult) {
    super(
      result.rejectedRelays.length + result.timedOutRelays.length === 0
        ? 'No relays are available for publication.'
        : 'No relay confirmed acceptance of the event.'
    );
  }
}

const ACK_TIMEOUT_MS = 10_000;

export async function publishToRelays(
  pool: Pick<SimplePool, 'publish'>,
  relays: string[],
  event: Event,
  acknowledgmentTimeoutInMillis = ACK_TIMEOUT_MS,
  unavailableRelays: string[] = []
): Promise<PublicationResult> {
  if (relays.length === 0) {
    throw new PublicationFailedError({ ...emptyPublicationResult(), unavailableRelays });
  }

  // A single-relay call preserves the per-relay acknowledgment contract of
  // nostr-tools 1.6 even though 1.7 returns one Pub for the entire input list.
  const outcomes = await Promise.all(
    relays.map(
      (relay) =>
        new Promise<'accepted' | 'rejected' | 'timedOut'>((resolve, reject) => {
          let settled = false;
          const finish = (outcome: 'accepted' | 'rejected' | 'timedOut') => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(outcome);
          };
          const timeout = setTimeout(() => finish('timedOut'), acknowledgmentTimeoutInMillis);

          try {
            const publication = pool.publish([relay], event);
            publication.on('ok', () => finish('accepted'));
            publication.on('failed', () => finish('rejected'));
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        })
    )
  );

  const result: PublicationResult = { ...emptyPublicationResult(), unavailableRelays };
  outcomes.forEach((outcome, i) => {
    if (outcome === 'accepted') result.acceptedRelays.push(relays[i]);
    if (outcome === 'rejected') result.rejectedRelays.push(relays[i]);
    if (outcome === 'timedOut') result.timedOutRelays.push(relays[i]);
  });

  if (result.acceptedRelays.length === 0) throw new PublicationFailedError(result);
  return result;
}
