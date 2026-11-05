import { describe, expect, it } from 'vitest';

import { decodeNoteId } from '#lib/services/NostrClient.js';
import { hasNaddr } from '#lib/stores/operators.js';
import {
  KIND,
  naddrOf,
  neventOf,
  noteOf,
  nprofileOf,
  npubOf,
  nsecOf,
  type Event
} from '#lib/testing/nostr.js';
import { load as loadList } from '../../routes/li/[id]/+page';
import LongFormContent from './LongFormContent';
import Note from './Note';
import Profile from './Profile';

// The NIP-19 identifiers that Nosli writes and reads, through its own code. The strings that an
// encoder writes can change, so each is read back rather than compared.

const id = '07'.repeat(32);
const author = '0a'.repeat(32);

// As other clients write them, with the kind and the author before the relays and the event ID.
const neventWithAuthor =
  'nevent1qvzqqqqqqypzqzs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2qythwumn8ghj7un9d3shjtn90psk6urvv5hxxmmdqythwumn8ghj7mm5dpjhytn90psk6urvv5hxxmmdqqsqwpc8qurswpc8qurswpc8qurswpc8qurswpc8qurswpc8qurswpc5g9n4q';
const naddrWithRelay =
  'naddr1qvzqqqr4gupzqzs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2qythwumn8ghj7un9d3shjtn90psk6urvv5hxxmmdqqrk67fdd35hxaqy4zps8';

// As Nosli wrote them with nostr-tools 1.7.2, which wrote the event ID or identifier first, and no
// kind or author in an nevent. Links that were shared then still open.
const v1Naddr =
  'naddr1qqrk67fdd35hxaqpzamhxue69uhhyetvv9ujuetcv9khqmr99e3k7mgpzamhxue69uhk7argv4ezuetcv9khqmr99e3k7mgzyq9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5qcyqqq823c27guk5';
const v1Nevent =
  'nevent1qqsqwpc8qurswpc8qurswpc8qurswpc8qurswpc8qurswpc8qurswpcpzamhxue69uhhyetvv9ujuetcv9khqmr99e3k7mgpzamhxue69uhk7argv4ezuetcv9khqmr99e3k7mgherqx5';
const v1OtherNevent =
  'nevent1qqsqurswpc8qurswpc8qurswpc8qurswpc8qurswpc8qurswpc8qurspzamhxue69uhhg6rfwfjzuetcv9khqmr99e3k7mgagd3ld';

// An nevent that ends in a type without a length, which nostr-tools 1.7 never finished reading.
const neventEndingInType = 'nevent1qqsqwpc8qurswpc8qurswpc8qurswpc8qurswpc8qurswpc8qurswpcp2q3lu4';

const list = (identifier: string, pubkey = author) =>
  new LongFormContent(
    undefined,
    identifier,
    pubkey,
    '',
    new Date(0),
    '',
    '',
    undefined,
    undefined,
    []
  );

const listEvent = (identifier: string): Event => ({
  id,
  sig: '',
  kind: KIND.article,
  pubkey: author,
  content: '',
  created_at: 1,
  tags: [['d', identifier]]
});

describe('decodeNoteId', () => {
  it('reads a note', () => {
    expect(decodeNoteId(noteOf(id))).toEqual({ id, relays: [] });
  });

  it('reads an nevent with the relays that it hints at, in order', () => {
    const relays = ['wss://b.example.com', 'wss://a.example.com', 'wss://c.example.com'];

    expect(decodeNoteId(neventOf(id, relays))).toEqual({ id, relays });
    expect(decodeNoteId(neventOf(id))).toEqual({ id, relays: [] });
  });

  it('reads an nevent that also gives the kind and the author of the note', () => {
    expect(decodeNoteId(neventWithAuthor)).toEqual({
      id,
      relays: ['wss://relay.example.com', 'wss://other.example.com']
    });
  });

  it('reads an nevent that Nosli wrote with nostr-tools 1', () => {
    expect(decodeNoteId(v1Nevent)).toEqual({
      id,
      relays: ['wss://relay.example.com', 'wss://other.example.com']
    });
  });

  it('reads an identifier in uppercase', () => {
    expect(decodeNoteId(noteOf(id).toUpperCase())).toEqual({ id, relays: [] });
    expect(decodeNoteId(neventWithAuthor.toUpperCase()).id).toBe(id);
  });

  it('rejects any other identifier', () => {
    for (const other of [
      npubOf(author),
      nsecOf(author),
      nprofileOf(author, ['wss://relay.example.com']),
      naddrOf({ kind: KIND.article, pubkey: author, identifier: 'my-list' }),
      id,
      `nostr:${noteOf(id)}`,
      'note1',
      ''
    ]) {
      expect(() => decodeNoteId(other), other).toThrow();
    }
  });

  it('rejects an identifier whose checksum is wrong', () => {
    const note = noteOf(id);

    expect(() => decodeNoteId(note.slice(0, -1) + (note.endsWith('q') ? 'p' : 'q'))).toThrow();
  });

  it('rejects an nevent that ends in a type, at once', () => {
    expect(() => decodeNoteId(neventEndingInType)).toThrow();
  }, 1000);
});

describe('Note.nip19Id', () => {
  it('gives the note of the event ID', () => {
    const note = new Note(id, '', author, new Date(0), [], undefined);

    expect(decodeNoteId(note.nip19Id() ?? '')).toEqual({ id, relays: [] });
  });

  it('replaces the NIP-08 references to e and p tags with a note and an npub', () => {
    const note = Note.fromEvent({
      id,
      sig: '',
      kind: KIND.text,
      pubkey: author,
      content: '#[0] #[1]',
      created_at: 1,
      tags: [
        ['e', id],
        ['p', author]
      ]
    });

    expect(note.modifiedContent()).toBe(`@${noteOf(id)} @${npubOf(author)}`);
  });
});

describe('Profile.nip19Id', () => {
  it('gives the npub of the pubkey', () => {
    const profile = new Profile(undefined, '', '', undefined, undefined, author, new Date(0), '');

    expect(profile.nip19Id()).toBe(npubOf(author));
  });
});

describe('LongFormContent.nip19Id', () => {
  // The naddr is read back as the list page reads it.
  const read = async (naddr: string) =>
    loadList({ params: { id: naddr } } as unknown as Parameters<typeof loadList>[0]).params;

  it.each(['my-list', '', 'リスト 📝', 'あ'.repeat(85)])(
    'gives an naddr that points to the list %j',
    async (identifier) => {
      expect(await read(list(identifier).nip19Id())).toEqual({
        kind: KIND.article,
        pubkey: author,
        identifier,
        relays: []
      });
    }
  );

  it('reads an naddr that hints at relays', async () => {
    expect(await read(naddrWithRelay)).toEqual({
      kind: KIND.article,
      pubkey: author,
      identifier: 'my-list',
      relays: ['wss://relay.example.com']
    });
  });

  it('reads an naddr that Nosli wrote with nostr-tools 1', async () => {
    expect(await read(v1Naddr)).toEqual({
      kind: KIND.article,
      pubkey: author,
      identifier: 'my-list',
      relays: ['wss://relay.example.com', 'wss://other.example.com']
    });
  });

  it('has an naddr only for an identifier of at most 255 bytes', () => {
    const packet = (identifier: string) => ({ from: '', subId: '', event: listEvent(identifier) });

    // 'あ' is 3 bytes in UTF-8.
    expect(hasNaddr(packet('あ'.repeat(85)))).toBe(true);
    expect(hasNaddr(packet('a'.repeat(255)))).toBe(true);
    expect(hasNaddr(packet('あ'.repeat(86)))).toBe(false);
    expect(hasNaddr(packet('a'.repeat(256)))).toBe(false);
  });
});

describe('LongFormContent.compose', () => {
  const compose = (relays: string[]) =>
    LongFormContent.compose({
      identifier: 'my-list',
      title: '',
      summary: '',
      notes: [{ id, relays }]
    });

  it('writes each note as an nevent with the relays that it hints at', () => {
    const relays = ['wss://b.example.com', 'wss://a.example.com'];
    const content = compose(relays).content;

    expect(content).toMatch(/^nostr:nevent1/);
    expect(decodeNoteId(content.slice('nostr:'.length))).toEqual({ id, relays });
  });

  it('writes the first 3 hints of a note, so that an nevent with the longest hints still encodes', () => {
    // An nevent holds at most 5000 characters, and a hint at most 255 bytes.
    const relays = Array.from({ length: 20 }, (_, i) => `wss://${i}.${'r'.repeat(240)}.com`);
    expect(() => neventOf(id, relays)).toThrow();

    const content = compose(relays).content;

    expect(content.length).toBeLessThanOrEqual('nostr:'.length + 5000);
    expect(decodeNoteId(content.slice('nostr:'.length))).toEqual({
      id,
      relays: relays.slice(0, 3)
    });
  });

  it('reads back the hints of the nevents that Nosli wrote with nostr-tools 1', () => {
    const other = '0e'.repeat(32);
    const lfc = LongFormContent.fromEvent({
      ...listEvent('my-list'),
      content: `nostr:${v1Nevent}\nnostr:${v1OtherNevent}`,
      tags: [
        ['d', 'my-list'],
        ['e', id, 'wss://relay.example.com'],
        ['e', other]
      ]
    });

    expect(lfc.noteReferences()).toEqual([
      { id, relays: ['wss://relay.example.com', 'wss://other.example.com'] },
      { id: other, relays: ['wss://third.example.com'] }
    ]);
    expect(lfc.noteRelays()).toEqual([
      'wss://relay.example.com',
      'wss://other.example.com',
      'wss://third.example.com'
    ]);
    expect(lfc.hasContentBesidesNotes()).toBe(false);
  });

  it('takes an nevent that ends in a type for content that is not a note, at once', () => {
    const lfc = LongFormContent.fromEvent({
      ...listEvent('my-list'),
      content: `nostr:${neventEndingInType}`,
      tags: [
        ['d', 'my-list'],
        ['e', id]
      ]
    });

    expect(lfc.noteReferences()).toEqual([{ id, relays: [] }]);
    expect(lfc.noteRelays()).toEqual([]);
    expect(lfc.hasContentBesidesNotes()).toBe(true);
  }, 1000);

  it('reads the hints of an nevent that another client wrote back', () => {
    const lfc = LongFormContent.fromEvent({
      ...listEvent('my-list'),
      content: `nostr:${neventWithAuthor}`,
      tags: [
        ['d', 'my-list'],
        ['e', id]
      ]
    });

    expect(lfc.noteReferences()).toEqual([
      { id, relays: ['wss://relay.example.com', 'wss://other.example.com'] }
    ]);
    expect(lfc.hasContentBesidesNotes()).toBe(false);
  });
});
