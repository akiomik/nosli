import { describe, expect, it } from 'vitest';
import { KIND } from '#lib/testing/nostr.js';

import LongFormContent from '#lib/entities/LongFormContent.js';
import { initialIdentifier, isValidIdentifier } from './listIdentifier';

const list = (tags: string[][]) =>
  LongFormContent.fromEvent({
    id: 'd'.repeat(64),
    sig: '',
    kind: KIND.article,
    pubkey: 'c'.repeat(64),
    content: '',
    created_at: 1_700_000_000,
    tags: [...tags, ['title', 'Title'], ['t', 'nosli']]
  });

// A list that another client published with an empty d tag.
const emptyIdentifierList = list([['d', '']]);

describe('initialIdentifier', () => {
  it('starts a new list with a new identifier', () => {
    expect(initialIdentifier(undefined, new Date(1_700_000_000_000))).toBe('nosli-1700000000000');
  });

  it('keeps the identifier of a list when updating it', () => {
    expect(initialIdentifier(list([['d', 'my-list']]))).toBe('my-list');
  });

  it('keeps the empty identifier of a list when updating it', () => {
    expect(initialIdentifier(emptyIdentifierList)).toBe('');
  });

  it('takes a list without a d tag to have the empty identifier', () => {
    expect(initialIdentifier(list([]))).toBe('');
  });
});

describe('isValidIdentifier', () => {
  it('accepts an identifier of 1 to 40 characters for a new list', () => {
    expect(isValidIdentifier('a', undefined)).toBe(true);
    expect(isValidIdentifier('a'.repeat(40), undefined)).toBe(true);
    expect(isValidIdentifier('', undefined)).toBe(false);
    expect(isValidIdentifier('a'.repeat(41), undefined)).toBe(false);
  });

  it('accepts the identifier of a list when updating it, even an empty or long one', () => {
    expect(isValidIdentifier('', emptyIdentifierList)).toBe(true);
    expect(isValidIdentifier('a'.repeat(41), emptyIdentifierList)).toBe(true);
  });
});

describe('updating a list with an empty identifier', () => {
  it('publishes the update at the same address', () => {
    const update = LongFormContent.compose({
      identifier: initialIdentifier(emptyIdentifierList),
      title: 'New title',
      summary: '',
      notes: [{ id: 'e'.repeat(64) }],
      previous: emptyIdentifierList
    });

    const dTags = update.toEvent().tags.filter(([name]) => name === 'd');

    expect(dTags).toEqual([['d', '']]);
  });
});
