import { redirect } from '@sveltejs/kit';
import { nip19 } from 'nostr-tools';
import { browser } from '$app/environment';
import KeyManager from '$lib/services/KeyManager';

export const load = async () => {
  if (browser && KeyManager.isLoggedIn()) {
    try {
      const pubkey = await KeyManager.getPublicKey();
      throw redirect(302, `/p/${nip19.npubEncode(pubkey)}`);
    } catch {
      // noop
    }
  }
};
