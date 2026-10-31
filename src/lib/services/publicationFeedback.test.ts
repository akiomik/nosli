import { describe, expect, it } from 'vitest';

import en from '$lib/locales/en.json';
import ja from '$lib/locales/ja.json';
import { publicationFailureKey, publicationSuccessMessage } from './publicationFeedback';
import {
  PublicationFailedError,
  emptyPublicationResult,
  type PublicationResult
} from './publishToRelays';

const result = (overrides: Partial<PublicationResult> = {}): PublicationResult => ({
  ...emptyPublicationResult(),
  ...overrides
});

describe('publicationSuccessMessage', () => {
  it.each(['created', 'updated', 'deleted'] as const)(
    'reports %s without counts when every relay accepted',
    (action) => {
      const message = publicationSuccessMessage(action, result({ acceptedRelays: ['a', 'b'] }));

      expect(message).toEqual({ key: action });
    }
  );

  it.each(['created', 'updated', 'deleted'] as const)(
    'reports %s with counts when only some relays accepted',
    (action) => {
      const message = publicationSuccessMessage(
        action,
        result({ acceptedRelays: ['a'], rejectedRelays: ['b'] })
      );

      expect(message).toEqual({
        key: `publication.${action}-partially`,
        values: { accepted: 1, total: 2 }
      });
    }
  );

  it.each(['created', 'updated'] as const)(
    'counts only relays that received the event when %s',
    (action) => {
      const message = publicationSuccessMessage(
        action,
        result({
          acceptedRelays: ['a', 'b'],
          rejectedRelays: ['c'],
          timedOutRelays: ['d'],
          unavailableRelays: ['e', 'f']
        })
      );

      expect(message.values).toEqual({ accepted: 2, total: 4 });
    }
  );

  it.each(['created', 'updated'] as const)(
    'reports %s without counts when the only missing relays were unavailable',
    (action) => {
      const message = publicationSuccessMessage(
        action,
        result({ acceptedRelays: ['a', 'b'], unavailableRelays: ['c', 'd'] })
      );

      expect(message).toEqual({ key: action });
    }
  );

  it('warns about unavailable relays after a deletion because they can still serve the list', () => {
    const message = publicationSuccessMessage(
      'deleted',
      result({ acceptedRelays: ['a', 'b'], unavailableRelays: ['c'] })
    );

    expect(message).toEqual({
      key: 'publication.deleted-partially',
      values: { accepted: 2, total: 3 }
    });
  });
});

describe('publicationFailureKey', () => {
  it('reports that nothing was sent when no relay was available', () => {
    const error = new PublicationFailedError(result({ unavailableRelays: ['a'] }));

    expect(publicationFailureKey(error)).toBe('publication.failed-no-relay');
  });

  it('reports a rejection when every reachable relay refused', () => {
    const error = new PublicationFailedError(
      result({ rejectedRelays: ['a'], unavailableRelays: ['b'] })
    );

    expect(publicationFailureKey(error)).toBe('publication.failed-rejected');
  });

  it('reports an unconfirmed outcome when any relay stayed silent', () => {
    const error = new PublicationFailedError(
      result({ rejectedRelays: ['a'], timedOutRelays: ['b'] })
    );

    expect(publicationFailureKey(error)).toBe('publication.failed-unconfirmed');
  });

  it('falls back to a generic message for signing and other errors', () => {
    expect(publicationFailureKey(new Error('User rejected'))).toBe('publication.failed');
  });
});

describe.each([
  ['en', en],
  ['ja', ja]
])('publication messages in %s', (_locale, messages) => {
  const publication: Record<string, string> = messages.publication;

  it.each([
    'created-partially',
    'updated-partially',
    'deleted-partially',
    'failed',
    'failed-no-relay',
    'failed-rejected',
    'failed-unconfirmed',
    'saving',
    'deleting',
    'waiting'
  ])('defines %s', (key) => {
    expect(publication[key]).toEqual(expect.any(String));
  });

  it.each(['created-partially', 'updated-partially', 'deleted-partially'])(
    'interpolates the relay counts in %s',
    (key) => {
      expect(publication[key]).toContain('{accepted}');
      expect(publication[key]).toContain('{total}');
    }
  );
});
