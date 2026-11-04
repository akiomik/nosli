import { describe, expect, it } from 'vitest';
import { Kind, type Event } from 'nostr-tools';

import LongFormContent from './LongFormContent';

const oldNote = 'a'.repeat(64);
const newNote = 'b'.repeat(64);
const author = 'c'.repeat(64);

// A list that another NIP-23 client created, with `d` not in the first position.
const otherClientEvent: Event = {
  id: 'd'.repeat(64),
  sig: '',
  kind: Kind.Article,
  pubkey: author,
  content: 'Prose from another client',
  created_at: 1_700_000_000,
  tags: [
    ['title', 'Old title'],
    ['d', 'my-list'],
    ['summary', 'Old summary'],
    ['image', 'https://example.com/cover.png'],
    ['published_at', '1600000000'],
    ['e', oldNote, 'wss://relay.example.com', 'mention'],
    ['t', 'nosli'],
    ['t', 'nostr'],
    ['p', author, 'wss://relay.example.com'],
    ['client', 'other-client']
  ]
};

describe('LongFormContent.fromEvent', () => {
  it('reads the identifier from the d tag wherever it is', () => {
    expect(LongFormContent.fromEvent(otherClientEvent).identifier).toBe('my-list');
  });

  it('keeps the tags that Nosli does not read or rebuild as they are', () => {
    expect(LongFormContent.fromEvent(otherClientEvent).otherTags).toEqual([
      ['t', 'nostr'],
      ['p', author, 'wss://relay.example.com'],
      ['client', 'other-client']
    ]);
  });
});

describe('LongFormContent.compose', () => {
  const form = { identifier: 'my-list', title: 'New title', summary: 'New summary' };

  it('creates a list with only the tags that Nosli writes', () => {
    const event = LongFormContent.compose({ ...form, noteIds: [newNote] }).toEvent();

    expect(event.tags).toEqual([
      ['d', 'my-list'],
      ['title', 'New title'],
      ['summary', 'New summary'],
      ['e', newNote],
      ['t', 'nosli']
    ]);
  });

  it('keeps the metadata and tags of the previous version when updating', () => {
    const previous = LongFormContent.fromEvent(otherClientEvent);
    const event = LongFormContent.compose({ ...form, noteIds: [newNote], previous }).toEvent();

    expect(event.tags).toEqual([
      ['d', 'my-list'],
      ['title', 'New title'],
      ['summary', 'New summary'],
      ['e', newNote],
      ['t', 'nosli'],
      ['t', 'nostr'],
      ['p', author, 'wss://relay.example.com'],
      ['client', 'other-client'],
      ['image', 'https://example.com/cover.png'],
      ['published_at', '1600000000']
    ]);
  });

  it('builds the content from the notes', () => {
    const lfc = LongFormContent.compose({ ...form, noteIds: [newNote, oldNote] });

    expect(lfc.content.split('\n')).toHaveLength(2);
    expect(lfc.content).toMatch(/^nostr:nevent1\w+\nnostr:nevent1\w+$/);
  });
});
