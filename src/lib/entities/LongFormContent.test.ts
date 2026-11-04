import { describe, expect, it } from 'vitest';
import { Kind, nip19, type Event } from 'nostr-tools';

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

  it('gives the address shared by every version of the list', () => {
    expect(LongFormContent.fromEvent(otherClientEvent).address()).toBe(`30023:${author}:my-list`);
  });
});

describe('LongFormContent.isDeletedBy', () => {
  const lfc = LongFormContent.fromEvent(otherClientEvent);
  const request = (tags: string[][], createdAt: number): Event => ({
    id: 'e'.repeat(64),
    sig: '',
    kind: Kind.EventDeletion,
    pubkey: author,
    content: '',
    created_at: createdAt,
    tags
  });

  it('counts an address request made in the same second as the version', () => {
    const createdAt = otherClientEvent.created_at;

    expect(lfc.isDeletedBy([request([['a', lfc.address()]], createdAt)])).toBe(true);
    expect(lfc.isDeletedBy([request([['a', lfc.address()]], createdAt - 1)])).toBe(false);
  });

  it('ignores an event that is not a deletion request', () => {
    expect(lfc.isDeletedBy([{ ...request([['e', otherClientEvent.id]], 0), kind: 1 }])).toBe(false);
  });

  it('keeps the tags that Nosli does not read or rebuild as they are', () => {
    expect(LongFormContent.fromEvent(otherClientEvent).otherTags).toEqual([
      ['t', 'nostr'],
      ['p', author, 'wss://relay.example.com']
    ]);
  });

  it.each(['', 'abc', '99999999999999'])('keeps an unreadable published_at %j as it is', (raw) => {
    const lfc = LongFormContent.fromEvent({ ...otherClientEvent, tags: [['published_at', raw]] });

    expect(lfc.publishedAt).toBeUndefined();
    expect(lfc.otherTags).toEqual([['published_at', raw]]);
  });

  it('drops a tag with a value that is not a string', () => {
    const tags = [['p', author, null]] as unknown as string[][];

    expect(LongFormContent.fromEvent({ ...otherClientEvent, tags }).otherTags).toEqual([]);
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
      ['image', 'https://example.com/cover.png'],
      ['published_at', '1600000000']
    ]);
  });

  it('builds the content from the notes in order', () => {
    const lfc = LongFormContent.compose({ ...form, noteIds: [newNote, oldNote] });

    expect(lfc.content).toBe(
      [newNote, oldNote].map((id) => `nostr:${nip19.neventEncode({ id })}`).join('\n')
    );
  });
});
