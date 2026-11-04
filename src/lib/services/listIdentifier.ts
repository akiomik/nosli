import type LongFormContent from '#lib/entities/LongFormContent.js';

const MAX_IDENTIFIER_LENGTH = 40;

// The identifier that the form starts with. An update keeps the identifier of the list, even an
// empty one, which other clients can publish; otherwise it would be published as a new list.
export function initialIdentifier(list: LongFormContent | undefined, now = new Date()): string {
  return list ? list.identifier : `nosli-${now.getTime()}`;
}

// Only the identifier of a new list is checked: an update cannot change its identifier, and that of
// a list from another client can be outside these limits.
export function isValidIdentifier(identifier: string, list: LongFormContent | undefined): boolean {
  if (list) return true;
  return identifier.length > 0 && identifier.length <= MAX_IDENTIFIER_LENGTH;
}
