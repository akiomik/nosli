import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicKey, nip19 } from 'nostr-tools';

import { nip07, pubkey } from '$lib/stores/cookie';
import { load } from './+page';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/stores/cookie', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

afterEach(() => {
  nip07.set(false);
  pubkey.set('');
  vi.unstubAllGlobals();
});

describe('login page load', () => {
  it('redirects a user logged in with a key to their profile', async () => {
    const hex = getPublicKey('1'.repeat(64));
    pubkey.set(hex);

    await expect(load()).rejects.toMatchObject({
      status: 302,
      location: `/p/${nip19.npubEncode(hex)}`
    });
  });

  it('redirects a NIP-07 user to the profile the extension gives', async () => {
    const hex = getPublicKey('2'.repeat(64));
    nip07.set(true);
    vi.stubGlobal('window', { nostr: { getPublicKey: async () => hex } });

    await expect(load()).rejects.toMatchObject({ location: `/p/${nip19.npubEncode(hex)}` });
  });

  it('shows the login form when the NIP-07 extension is missing', async () => {
    nip07.set(true);
    vi.stubGlobal('window', {});

    await expect(load()).resolves.toBeUndefined();
  });

  it('shows the login form when the NIP-07 extension refuses', async () => {
    nip07.set(true);
    vi.stubGlobal('window', { nostr: { getPublicKey: () => Promise.reject(new Error('denied')) } });

    await expect(load()).resolves.toBeUndefined();
  });

  it('shows the login form when the key is not hex', async () => {
    pubkey.set('not-a-key');

    await expect(load()).resolves.toBeUndefined();
  });

  it('shows the login form to a user who is not logged in', async () => {
    await expect(load()).resolves.toBeUndefined();
  });
});
