import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('LongFormContent.eventIds', () => {
  it('gives the event IDs of the e tags in order, skipping values that are not event IDs', () => {
    const list = LongFormContent.fromEvent({
      ...otherClientEvent,
      tags: [
        ['d', 'my-list'],
        ['e', newNote],
        ['e', 'abc'],
        ['e', oldNote.toUpperCase()],
        ['e', oldNote]
      ]
    });

    expect(list.eventIds()).toEqual([newNote, oldNote]);
  });
});

describe('LongFormContent.compose', () => {
  const form = { identifier: 'my-list', title: 'New title', summary: 'New summary' };

  afterEach(() => {
    vi.useRealTimers();
  });

  // Composes a list at `now`, in seconds, and returns its created_at.
  const createdAt = (now: number, previousCreatedAt?: number) => {
    vi.useFakeTimers({ now: now * 1000, toFake: ['Date'] });
    const previous =
      previousCreatedAt === undefined
        ? undefined
        : LongFormContent.fromEvent({ ...otherClientEvent, created_at: previousCreatedAt });
    return LongFormContent.compose({ ...form, notes: [{ id: newNote }], previous }).toEvent()
      .created_at;
  };

  it('creates a list at the current time', () => {
    expect(createdAt(1_800_000_000)).toBe(1_800_000_000);
  });

  it('updates a list at the current time when the previous version is older', () => {
    expect(createdAt(1_800_000_000, 1_700_000_000)).toBe(1_800_000_000);
  });

  it('updates a list later than a previous version from the same second', () => {
    expect(createdAt(1_800_000_000.4, 1_800_000_000)).toBe(1_800_000_001);
  });

  it('updates a list later than a previous version, also when the current time rounds up', () => {
    expect(createdAt(1_800_000_000.6, 1_800_000_001)).toBe(1_800_000_002);
  });

  it('updates a list later than a previous version from a clock that is ahead', () => {
    expect(createdAt(1_800_000_000, 1_800_000_300)).toBe(1_800_000_301);
  });

  it('creates a list with only the tags that Nosli writes', () => {
    const event = LongFormContent.compose({ ...form, notes: [{ id: newNote }] }).toEvent();

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
    const event = LongFormContent.compose({
      ...form,
      notes: [{ id: newNote }],
      previous
    }).toEvent();

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
    const lfc = LongFormContent.compose({ ...form, notes: [{ id: newNote }, { id: oldNote }] });

    expect(lfc.content).toBe(
      [newNote, oldNote].map((id) => `nostr:${nip19.neventEncode({ id })}`).join('\n')
    );
  });

  it('keeps a relay hint in the e tag and every hint in the content', () => {
    const relays = ['wss://a.example.com', 'wss://b.example.com'];
    const lfc = LongFormContent.compose({ ...form, notes: [{ id: newNote, relays }] });

    expect(lfc.toEvent().tags).toContainEqual(['e', newNote, 'wss://a.example.com']);
    expect(lfc.content).toBe(`nostr:${nip19.neventEncode({ id: newNote, relays })}`);
  });

  it('keeps the first 3 hints of a note in the content, so that one with many hints encodes', () => {
    const relays = Array.from({ length: 20 }, (_, i) => `wss://${i}.${'r'.repeat(240)}.com`);
    const lfc = LongFormContent.compose({ ...form, notes: [{ id: newNote, relays }] });

    expect(lfc.content).toBe(
      `nostr:${nip19.neventEncode({ id: newNote, relays: relays.slice(0, 3) })}`
    );
  });
});

describe('LongFormContent.noteReferences', () => {
  it('reads the relay hint of each e tag, keeping only wss:// URLs', () => {
    const tags = [
      ['e', newNote, 'wss://Relay.Example.com/'],
      ['e', oldNote, 'ws://insecure.example.com'],
      ['e', 'c'.repeat(64)]
    ];
    const lfc = LongFormContent.fromEvent({ ...otherClientEvent, tags });

    expect(lfc.noteReferences()).toEqual([
      { id: newNote, relays: ['wss://relay.example.com'] },
      { id: oldNote, relays: [] },
      { id: 'c'.repeat(64), relays: [] }
    ]);
    expect(lfc.noteRelays()).toEqual(['wss://relay.example.com']);
  });

  it('adds the relays of the nevents in the content, after the relay of the e tag', () => {
    const relays = ['wss://a.example.com', 'wss://b.example.com', 'wss://c.example.com'];
    const lfc = LongFormContent.fromEvent({
      ...otherClientEvent,
      content: `Some prose nostr:${nip19.neventEncode({ id: newNote, relays })}\nnostr:nevent1bad`,
      tags: [
        ['e', newNote, 'wss://b.example.com'],
        ['e', oldNote]
      ]
    });

    expect(lfc.noteReferences()).toEqual([
      {
        id: newNote,
        relays: ['wss://b.example.com', 'wss://a.example.com', 'wss://c.example.com']
      },
      { id: oldNote, relays: [] }
    ]);
  });

  it('keeps every hint of a note through compose and back', () => {
    const relays = ['wss://a.example.com', 'wss://b.example.com', 'wss://c.example.com'];
    const lfc = LongFormContent.compose({
      identifier: 'my-list',
      title: 'Title',
      summary: '',
      notes: [{ id: newNote, relays }]
    });

    expect(
      LongFormContent.fromEvent({ ...lfc.toEvent(), pubkey: author }).noteReferences()
    ).toEqual([{ id: newNote, relays }]);
  });

  it('gives the relays that more notes hint at first', () => {
    const lfc = LongFormContent.fromEvent({
      ...otherClientEvent,
      tags: [
        ['e', newNote, 'wss://once.example.com'],
        ['e', oldNote, 'wss://twice.example.com'],
        ['e', 'c'.repeat(64), 'wss://twice.example.com']
      ]
    });

    expect(lfc.noteRelays()).toEqual(['wss://twice.example.com', 'wss://once.example.com']);
  });
});
