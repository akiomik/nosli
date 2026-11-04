import { afterEach, describe, expect, it, vi } from 'vitest';
import { nip05 } from 'nostr-tools';

import Profile from './Profile';

const pubkey = 'a'.repeat(64);
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
