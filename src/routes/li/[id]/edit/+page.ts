import { error } from '@sveltejs/kit';
import { Kind, nip19 } from 'nostr-tools';
import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import RxNostrClient from '$lib/services/RxNostrClient';
import KeyManager from '$lib/services/KeyManager';
import * as settings from '$lib/services/settings';
import { ensureAddressPointer } from '$lib/helper';

export const load = (({ params }) => {
  let data;
  try {
    data = nip19.decode(params.id).data;
  } catch {
    throw error(404, 'Not Found 💔');
  }

  if (!ensureAddressPointer(data) || data.kind != Kind.Article) {
    throw error(404, 'Not Found 💔');
  }

  let client: RxNostrClient;
  if (browser) {
    if (KeyManager.isLoggedInWithPublicKey()) {
      throw error(401, '/');
    }

    client = new RxNostrClient({ relays: settings.defaultRelays });
  }

  return {
    params: data,
    client
  };
}) satisfies PageLoad;
