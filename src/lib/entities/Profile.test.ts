import { describe, expect, it } from 'vitest';
import { Kind, type Event } from 'nostr-tools';

import Profile from './Profile';

const pubkey = 'a'.repeat(64);
const metadata = (content: string): Event => ({
  id: 'b'.repeat(64),
  sig: '',
  kind: Kind.Metadata,
  pubkey,
  content,
  created_at: 1_700_000_000,
  tags: []
});

describe('Profile.fromEvent', () => {
  it('reads the fields of the content', () => {
    const content = {
      name: 'alice',
      display_name: 'Alice',
      picture: 'https://example.com/alice.png',
      nip05: '_@example.com',
      about: 'Hello'
    };
    const profile = Profile.fromEvent(metadata(JSON.stringify(content)));

    expect(profile?.formattedName()).toBe('Alice');
    expect(profile?.safePicture()).toBe('https://example.com/alice.png');
    expect(profile?.formattedNip05()).toBe('example.com');
    expect(profile?.about).toBe('Hello');
  });

  it.each(['not JSON', '', 'null', '[]', '1', '"alice"'])(
    'returns undefined when the content is %j',
    (content) => {
      expect(Profile.fromEvent(metadata(content))).toBeUndefined();
    }
  );

  it('reads a field that is not a string as missing', () => {
    const content = { name: 1, display_name: {}, picture: 1, nip05: true, about: ['Hello'] };
    const profile = Profile.fromEvent(metadata(JSON.stringify(content)));

    expect(profile?.formattedName()).toBe(`${pubkey.slice(0, 8)}:${pubkey.slice(-8)}`);
    expect(profile?.safePicture()).toBeUndefined();
    expect(profile?.formattedNip05()).toBe('');
    expect(profile?.about).toBe('');
  });
});
