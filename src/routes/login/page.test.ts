import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicKey, nip19 } from 'nostr-tools';

import KeyManager, { Nip07MissingError } from '#lib/services/KeyManager.js';
import { nip07, pubkey } from '#lib/stores/cookie.js';
import { LOGIN_DEPENDENCY } from '#lib/stores/login.js';
import { load } from './+page';

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

const depends = vi.fn();
const run = () => load({ depends } as unknown as Parameters<typeof load>[0]);

afterEach(() => {
  nip07.set(false);
  pubkey.set('');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  depends.mockClear();
});

describe('login page load', () => {
  it('runs again when the login changes', async () => {
    await run();

    expect(depends).toHaveBeenCalledWith(LOGIN_DEPENDENCY);
  });

  it('redirects a user logged in with a key to their profile', async () => {
    const hex = getPublicKey('1'.repeat(64));
    pubkey.set(hex);

    await expect(run()).rejects.toMatchObject({
      status: 302,
      location: `/p/${nip19.npubEncode(hex)}`
    });
  });

  it('gives a NIP-07 user the profile that the extension gives, without waiting for it', async () => {
    const hex = getPublicKey('2'.repeat(64));
    nip07.set(true);
    let answer = () => {};
    const asked = new Promise<void>((resolve) => (answer = resolve));
    vi.stubGlobal('window', { nostr: { getPublicKey: () => asked.then(() => hex) } });

    const { profile } = await run();
    answer();

    await expect(profile).resolves.toBe(`/p/${nip19.npubEncode(hex)}`);
  });

  it('stops waiting for the NIP-07 extension when the page stops the lookup', async () => {
    nip07.set(true);
    vi.stubGlobal('window', { nostr: { getPublicKey: () => new Promise<string>(() => {}) } });

    const { profile, keyLookup } = await run();
    expect(keyLookup).toBeDefined();
    keyLookup?.abort();

    await expect(profile).resolves.toBeUndefined();
  });

  it('shows the login form when the NIP-07 extension is missing', async () => {
    nip07.set(true);
    // KeyManager rejects once it has waited for the extension.
    vi.spyOn(KeyManager, 'getPublicKey').mockRejectedValue(new Nip07MissingError());

    await expect((await run()).profile).resolves.toBeUndefined();
  });

  it('shows the login form when the NIP-07 extension refuses', async () => {
    nip07.set(true);
    vi.stubGlobal('window', { nostr: { getPublicKey: () => Promise.reject(new Error('denied')) } });

    await expect((await run()).profile).resolves.toBeUndefined();
  });

  it('shows the login form when the key is not hex', async () => {
    pubkey.set('not-a-key');

    await expect(run()).resolves.toEqual({ profile: undefined });
  });

  it('shows the login form to a user who is not logged in', async () => {
    await expect(run()).resolves.toEqual({ profile: undefined });
  });
});
