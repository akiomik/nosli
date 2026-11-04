import { afterEach, describe, expect, it, vi } from 'vitest';
import { KIND, npubOf, type Event } from '#lib/testing/nostr.js';
import Profile from './Profile';

const pubkey = 'a'.repeat(64);
const metadata = (content: string): Event => ({
  id: 'b'.repeat(64),
  sig: '',
  kind: KIND.metadata,
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

describe('Profile.nip19Id', () => {
  it('gives the npub of the pubkey', () => {
    expect(profile('').nip19Id()).toBe(npubOf(pubkey));
  });
});

describe('Profile.isNip05Valid', () => {
  // The requests that the domains got, and their nostr.json, which a domain without one answers
  // with 404. A domain in `redirects` sends the request on to another one, which browsers follow
  // unless told otherwise.
  let requests: string[] = [];
  const serve = (
    domains: Record<string, Record<string, string>>,
    redirects: Record<string, string> = {}
  ) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: { redirect?: string }) => {
        const url = new URL(input);
        requests.push(url.href);
        const target = redirects[url.host];
        if (target !== undefined) {
          if (init?.redirect === 'manual') return { status: 0, type: 'opaqueredirect', ok: false };
          url.host = target;
        }
        const names = domains[url.host];
        if (names === undefined) return new Response('Not Found', { status: 404 });
        return Response.json({ names });
      })
    );

  afterEach(() => {
    requests = [];
    vi.unstubAllGlobals();
  });

  it('is valid when the identifier points to the pubkey of the profile', async () => {
    serve({ 'example.com': { alice: pubkey } });

    expect(await profile('alice@example.com').isNip05Valid()).toBe(true);
    expect(requests).toEqual(['https://example.com/.well-known/nostr.json?name=alice']);
  });

  it('is not valid when the identifier points to another pubkey', async () => {
    serve({ 'example.com': { alice: 'b'.repeat(64) } });

    expect(await profile('alice@example.com').isNip05Valid()).toBe(false);
  });

  it('is not valid when the domain does not list the name', async () => {
    serve({ 'example.com': {} });

    expect(await profile('alice@example.com').isNip05Valid()).toBe(false);
  });

  it('is not valid for a name that only an object has', async () => {
    serve({ 'example.com': {} });

    expect(await profile('__proto__@example.com').isNip05Valid()).toBe(false);
  });

  it('asks the domain for the name _ for an identifier of the domain alone', async () => {
    serve({ 'example.com': { _: pubkey } });

    expect(await profile('_@example.com').isNip05Valid()).toBe(true);
    expect(await profile('example.com').isNip05Valid()).toBe(true);
    expect(requests).toEqual([
      'https://example.com/.well-known/nostr.json?name=_',
      'https://example.com/.well-known/nostr.json?name=_'
    ]);
  });

  it('is valid when the domain sends the request on to its nostr.json', async () => {
    serve({ 'www.example.com': { alice: pubkey } }, { 'example.com': 'www.example.com' });

    expect(await profile('alice@example.com').isNip05Valid()).toBe(true);
  });

  it('is not valid when the domain has no nostr.json', async () => {
    serve({});

    expect(await profile('alice@example.com').isNip05Valid()).toBe(false);
  });

  it('is not valid when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    expect(await profile('alice@example.com').isNip05Valid()).toBe(false);
  });

  it('is not valid when the domain does not answer with JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html></html>'))
    );

    expect(await profile('alice@example.com').isNip05Valid()).toBe(false);
  });

  it.each(['', 'alice@', '@example.com', 'alice bob@example.com'])(
    'is not valid for the identifier %j',
    async (identifier) => {
      serve({ 'example.com': { alice: pubkey, _: pubkey } });

      expect(await profile(identifier).isNip05Valid()).toBe(false);
    }
  );

  it('is not valid without an identifier', async () => {
    serve({});
    const withoutNip05 = new Profile(
      undefined,
      '',
      '',
      undefined,
      undefined,
      pubkey,
      new Date(0),
      ''
    );

    expect(await withoutNip05.isNip05Valid()).toBe(false);
    expect(requests).toEqual([]);
  });
});
