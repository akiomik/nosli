import { get } from 'svelte/store';
import { error, redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import { pubkey, seckey } from '$lib/stores/cookie';
import NostrClient from '$lib/services/NostrClient';
import Tag from '$lib/entities/Tag';

export const load = (async ({ params }) => {
  if (browser) {
    if (get(seckey) === '') {
      throw redirect(302, '/');
    }

    const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);
    await client.connect();

    let matome: LongFormContent | undefined;
    try {
      matome = await client.getLongFormContent(params.id);
    } catch (e) {
      if (e instanceof TypeError) {
        throw error(404, 'Not Found 💔');
      } else {
        throw error(500, 'Internal Server Error');
      }
    }

    if (matome === undefined || !matome.includesTag(new Tag('t', 'nosli'))) {
      throw error(404, 'Not Found 💔');
    }

    if (matome.pubkey !== get(pubkey)) {
      throw error(401, 'Unauthorized');
    }

    return {
      id: params.id,
      matome,
      client
    };
  }
}) satisfies PageLoad;
