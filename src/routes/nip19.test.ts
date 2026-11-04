import { afterEach, describe, expect, it, vi } from 'vitest';

import { nip07, pubkey, seckey } from '#lib/stores/cookie.js';
import {
  KIND,
  naddrOf,
  neventOf,
  noteOf,
  nprofileOf,
  npubOf,
  nsecOf,
  publicKeyOf
} from '#lib/testing/nostr.js';
import { load as loadList } from './li/[id]/+page';
import { load as loadEdit } from './li/[id]/edit/+page';
import { load as loadLogin } from './login/+page';
import { load as loadProfile } from './p/[id]/+page';

// The NIP-19 identifiers that the pages take from their URL.

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

const secret = '7'.repeat(64);
const author = publicKeyOf(secret);
const pointer = { kind: KIND.article, pubkey: author, identifier: 'my-list' };
const relays = ['wss://relay.example.com', 'wss://other.example.com'];

const list = async (id: string) =>
  loadList({ params: { id } } as unknown as Parameters<typeof loadList>[0]);
const edit = async (id: string) =>
  loadEdit({ params: { id }, depends: vi.fn() } as unknown as Parameters<typeof loadEdit>[0]);
const profile = async (id: string) =>
  loadProfile({ params: { id } } as unknown as Parameters<typeof loadProfile>[0]);
const login = async () =>
  loadLogin({ depends: vi.fn() } as unknown as Parameters<typeof loadLogin>[0]);

// Identifiers that are not of a list or a profile.
const others = () => [
  ['an nsec', nsecOf(secret)],
  ['a note', noteOf('07'.repeat(32))],
  ['an nevent', neventOf('07'.repeat(32), relays)],
  ['a key in hex', author],
  ['an invalid identifier', 'naddr1invalid'],
  ['an empty identifier', '']
];

afterEach(() => {
  nip07.set(false);
  pubkey.set('');
  seckey.set('');
});

describe('list page load', () => {
  it('takes the naddr of a list', async () => {
    await expect(list(naddrOf(pointer))).resolves.toEqual({
      params: { ...pointer, relays: [] }
    });
  });

  it('takes the naddr of a list with the relays that it hints at', async () => {
    await expect(list(naddrOf({ ...pointer, relays }))).resolves.toEqual({
      params: { ...pointer, relays }
    });
  });

  it('takes an naddr that Nosli wrote with nostr-tools 1', async () => {
    const v1Naddr =
      'naddr1qqrk67fdd35hxaqpzamhxue69uhhyetvv9ujuetcv9khqmr99e3k7mgpzamhxue69uhk7argv4ezuetcv9khqmr99e3k7mgzyq9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5zs2pg9q5qcyqqq823c27guk5';

    await expect(list(v1Naddr)).resolves.toEqual({
      params: {
        kind: KIND.article,
        pubkey: '0a'.repeat(32),
        identifier: 'my-list',
        relays: ['wss://relay.example.com', 'wss://other.example.com']
      }
    });
  });

  it('takes an naddr in uppercase', async () => {
    await expect(list(naddrOf(pointer).toUpperCase())).resolves.toMatchObject({ params: pointer });
  });

  it('is not found for the naddr of another kind', async () => {
    await expect(list(naddrOf({ ...pointer, kind: 30024 }))).rejects.toMatchObject({
      status: 404
    });
  });

  it.each([...others(), ['an npub', npubOf(author)], ['an nprofile', nprofileOf(author)]])(
    'is not found for %s',
    async (_, id) => {
      await expect(list(id)).rejects.toMatchObject({ status: 404 });
    }
  );
});

describe('edit page load', () => {
  it('takes the naddr of a list for a user who can sign', async () => {
    seckey.set(secret);
    pubkey.set(author);

    await expect(edit(naddrOf({ ...pointer, relays }))).resolves.toEqual({
      params: { ...pointer, relays }
    });
  });

  it('is unauthorized for a user who can only read', async () => {
    pubkey.set(author);

    await expect(edit(naddrOf(pointer))).rejects.toMatchObject({ status: 401 });
  });

  it.each([...others(), ['an npub', npubOf(author)]])('is not found for %s', async (_, id) => {
    seckey.set(secret);
    pubkey.set(author);

    await expect(edit(id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('profile page load', () => {
  it('takes an npub', async () => {
    await expect(profile(npubOf(author))).resolves.toEqual({ pubkey: author });
  });

  it('takes an npub in uppercase', async () => {
    await expect(profile(npubOf(author).toUpperCase())).resolves.toEqual({ pubkey: author });
  });

  it.each([
    ...others(),
    ['an nprofile', nprofileOf(author, relays)],
    ['an naddr', naddrOf(pointer)]
  ])('is not found for %s', async (_, id) => {
    await expect(profile(id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('login page load', () => {
  it('sends a user logged in with a secret key to the npub of their profile', async () => {
    seckey.set(secret);
    pubkey.set(author);

    await expect(login()).rejects.toMatchObject({ status: 302, location: `/p/${npubOf(author)}` });
  });

  it('sends a user logged in with a pubkey to the npub of their profile', async () => {
    pubkey.set(author);

    await expect(login()).rejects.toMatchObject({ status: 302, location: `/p/${npubOf(author)}` });
  });
});
