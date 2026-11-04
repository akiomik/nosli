import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { KIND, type Event } from '#lib/testing/nostr.js';

import Note from './Note';

const noteId = 'a'.repeat(64);
const pubkey = 'b'.repeat(64);
const note = (content: string, tags: string[][]): Note =>
  Note.fromEvent({
    id: 'c'.repeat(64),
    sig: '',
    kind: KIND.text,
    pubkey,
    content,
    created_at: 1_700_000_000,
    tags
  } as Event);

describe('Note.modifiedContent', () => {
  it('replaces the NIP-08 references to e and p tags', () => {
    const content = note('#[0] and #[1]', [
      ['e', noteId],
      ['p', pubkey]
    ]).modifiedContent();

    expect(content).toBe(`@${nip19.noteEncode(noteId)} and @${nip19.npubEncode(pubkey)}`);
  });

  it('leaves a reference to a tag whose value is not 32 bytes of hex as it is', () => {
    const npub = nip19.npubEncode(pubkey);
    const content = note('#[0] #[1] #[2]', [
      ['p', npub],
      ['e', 'abc'],
      ['e', noteId.toUpperCase()]
    ]).modifiedContent();

    expect(content).toBe('#[0] #[1] #[2]');
  });
});
