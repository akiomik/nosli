import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import KeyManager from '$lib/services/KeyManager';
import * as settings from '$lib/services/settings';
import RxNostrClient from '$lib/services/RxNostrClient';

export const load = (() => {
  let client: RxNostrClient | undefined;

  if (browser) {
    if (!KeyManager.isLoggedIn() || KeyManager.isLoggedInWithPublicKey()) {
      throw error(401, '/');
    }

    client = new RxNostrClient({ relays: settings.defaultRelays });
  }

  return {
    client
  };
}) satisfies PageLoad;
