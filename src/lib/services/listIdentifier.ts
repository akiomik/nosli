import type LongFormContent from '$lib/entities/LongFormContent';

const MAX_IDENTIFIER_LENGTH = 40;

// The identifier that the form starts with. An update keeps the identifier of the list, even an
// empty one, which other clients can publish; otherwise it would be published as a new list.
export function initialIdentifier(list: LongFormContent | undefined, now = new Date()): string {
  return list ? list.identifier : `nosli-${now.getTime()}`;
}

// An update cannot change its identifier, so only that of a new list is checked.
export function isValidIdentifier(
  identifier: string | undefined,
  list: LongFormContent | undefined
): boolean {
  if (list) return true;
  return (
    identifier !== undefined && identifier.length > 0 && identifier.length <= MAX_IDENTIFIER_LENGTH
  );
}
