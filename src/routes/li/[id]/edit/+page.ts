import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import NostrClient from '$lib/services/NostrClient';
import KeyManager from '$lib/services/KeyManager';

export const load = (async ({ params }) => {
  if (browser) {
    if (KeyManager.isLoggedInWithPublicKey()) {
      throw error(401, '/');
    }

    const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);
    await client.connect();

    let matome: LongFormContent | undefined;
    try {
      matome = await client.getMatome(params.id);
    } catch (e) {
      console.error(e);
      if (e instanceof TypeError) {
        throw error(404, 'Not Found 💔');
      } else {
        throw error(500, 'Internal Server Error');
      }
    }

    if (matome === undefined) {
      throw error(404, 'Not Found 💔');
    }

    try {
      const loggedInAs = await KeyManager.isLoggedInAs(matome.pubkey);
      if (!loggedInAs) {
        throw error(401, 'Unauthorized');
      }
    } catch {
      throw error(401, 'Unauthorized');
    }

    return {
      id: params.id,
      matome,
      client
    };
  }
}) satisfies PageLoad;
