import { PublicationFailedError, type PublicationResult } from '$lib/services/publishToRelays';

export type PublicationAction = 'created' | 'updated' | 'deleted';

export type PublicationSuccessMessage = {
  key: string;
  values?: { accepted: number; total: number };
};

export function publicationSuccessMessage(
  action: PublicationAction,
  result: PublicationResult
): PublicationSuccessMessage {
  const accepted = result.acceptedRelays.length;
  const sent = accepted + result.rejectedRelays.length + result.timedOutRelays.length;
  // Any accepted relay can serve a created or updated list, but a relay that missed a deletion can
  // still serve the list once it reconnects.
  const total = action === 'deleted' ? sent + result.unavailableRelays.length : sent;

  if (accepted === total) return { key: action };
  return { key: `publication.${action}-partially`, values: { accepted, total } };
}

export function publicationFailureKey(error: unknown): string {
  if (!(error instanceof PublicationFailedError)) return 'publication.failed';
  // A silent relay may have stored the event, so it takes precedence over a rejection.
  if (error.result.timedOutRelays.length > 0) return 'publication.failed-unconfirmed';
  if (error.result.rejectedRelays.length > 0) return 'publication.failed-rejected';
  return 'publication.failed-no-relay';
}
