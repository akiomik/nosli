import { redirect } from '@sveltejs/kit';
import { nip19 } from 'nostr-tools';
import { browser } from '$app/environment';
import KeyManager from '$lib/services/KeyManager';

export const load = async () => {
  if (!browser || !KeyManager.isLoggedIn()) return;

  let pubkey: string;
  try {
    pubkey = await KeyManager.getPublicKey();
  } catch {
    // The NIP-07 extension can be missing or refuse, so show the login form instead.
    return;
  }
  throw redirect(302, `/p/${nip19.npubEncode(pubkey)}`);
};
