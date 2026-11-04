import { redirect } from '@sveltejs/kit';
import { nip19 } from 'nostr-tools';
import { browser } from '$app/environment';
import KeyManager from '$lib/services/KeyManager';

export const load = async () => {
  if (!browser || !KeyManager.isLoggedIn()) return;

  let location: string;
  try {
    location = `/p/${nip19.npubEncode(await KeyManager.getPublicKey())}`;
  } catch {
    // The NIP-07 extension can be missing or refuse, and the key from it or the cookie may not be
    // hex, so show the login form instead.
    return;
  }
  throw redirect(302, location);
};
