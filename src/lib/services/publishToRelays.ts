import type { Event } from 'nostr-tools';

// What publishes an event to each relay, as SimplePool of nostr-tools does, with the answer of each.
export type Publisher = { publish: (relays: string[], event: Event) => Promise<string>[] };

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

// The signer used an account other than the author's, such as another account of a NIP-07
// extension.
// Relays would ignore such a deletion, and keep such an update as a new list of the signer's.
export class SignedByAnotherAccountError extends Error {
  constructor() {
    super('The event is not signed by the author.');
  }
}

export const ACK_TIMEOUT_MS = 10_000;

// Whether nostr-tools failed to publish to the relay without its answer: the event was not sent, the
// connection closed, or the answer timed out. The relay may have stored the event, as with one that
// stays silent, or not got it, as with one whose connection dropped just before. nostr-tools rejects
// with a string or one of these errors of its own then, and with the reason of the relay when the
// relay refuses the event.
const isUnanswered = (error: unknown): boolean =>
  !(error instanceof Error) ||
  error.name === 'SendingOnClosedConnection' ||
  error.message === 'publish timed out' ||
  error.message.startsWith('relay connection');

export async function publishToRelays(
  pool: Publisher,
  relays: string[],
  event: Event,
  acknowledgmentTimeoutInMillis = ACK_TIMEOUT_MS,
  unavailableRelays: string[] = []
): Promise<PublicationResult> {
  if (relays.length === 0) {
    throw new PublicationFailedError({ ...emptyPublicationResult(), unavailableRelays });
  }

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
            const [publication] = pool.publish([relay], event);
            publication.then(
              () => finish('accepted'),
              (error: unknown) => finish(isUnanswered(error) ? 'timedOut' : 'rejected')
            );
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
