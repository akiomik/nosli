import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import NostrClient from '$lib/services/NostrClient';

export const load = (async ({ params }) => {
  if (browser) {
    const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);
    await client.connect();
    let matome: LongFormContent;

    try {
      const matomeOpt = await client.getLongFormContent(params.id);
      if (matomeOpt === undefined) {
        throw new Error();
      }

      matome = matomeOpt;
    } catch {
      throw error(404, 'Not Found 💔');
    }

    return {
      id: params.id,
      matome,
      client
    };
  }
}) satisfies PageLoad;
