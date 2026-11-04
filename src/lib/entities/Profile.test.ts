import { afterEach, describe, expect, it, vi } from 'vitest';
import { Kind, nip05, type Event } from 'nostr-tools';

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

const profile = (identifier: string) =>
  new Profile(undefined, '', '', undefined, identifier, pubkey, new Date(0), '');

describe('Profile.isNip05Valid', () => {
  // The domain lists `names` in its nostr.json.
  const serve = (names: Record<string, string>) =>
    nip05.useFetchImplementation(vi.fn(async () => ({ json: async () => ({ names }) })));

  afterEach(() => nip05.useFetchImplementation(fetch));

  it('is valid when the identifier points to the pubkey of the profile', async () => {
    serve({ alice: pubkey });

    expect(await profile('alice@example.com').isNip05Valid()).toBe(true);
  });

  it('is not valid when the identifier points to another pubkey', async () => {
    serve({ alice: 'b'.repeat(64) });

    expect(await profile('alice@example.com').isNip05Valid()).toBe(false);
  });

  it('is not valid when the domain does not list the name', async () => {
    serve({});

    expect(await profile('alice@example.com').isNip05Valid()).toBe(false);
  });

  it('is not valid for a name that only an object has', async () => {
    serve({});

    expect(await profile('__proto__@example.com').isNip05Valid()).toBe(false);
  });
});
