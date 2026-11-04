import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicKey, nip19 } from 'nostr-tools';

import KeyManager from '$lib/services/KeyManager';
import { load } from './+page';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/stores/cookie', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('login page load', () => {
  it('redirects a logged-in user to their profile', async () => {
    const pubkey = getPublicKey('1'.repeat(64));
    vi.spyOn(KeyManager, 'isLoggedIn').mockReturnValue(true);
    vi.spyOn(KeyManager, 'getPublicKey').mockResolvedValue(pubkey);

    await expect(load()).rejects.toMatchObject({
      status: 302,
      location: `/p/${nip19.npubEncode(pubkey)}`
    });
  });

  it('shows the login form when the public key is unavailable', async () => {
    vi.spyOn(KeyManager, 'isLoggedIn').mockReturnValue(true);
    vi.spyOn(KeyManager, 'getPublicKey').mockRejectedValue(new Error('Failed to resolve NIP-07'));

    await expect(load()).resolves.toBeUndefined();
  });

  it('shows the login form to a user who is not logged in', async () => {
    const getPublicKey = vi.spyOn(KeyManager, 'getPublicKey');
    vi.spyOn(KeyManager, 'isLoggedIn').mockReturnValue(false);

    await expect(load()).resolves.toBeUndefined();
    expect(getPublicKey).not.toHaveBeenCalled();
  });
});
