import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import NostrClient from '$lib/services/NostrClient';

export const load = (async () => {
  if (browser) {
    const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);
    await client.connect();

    const matomes = await client.listGlobalMatomes(25);

    return {
      matomes,
      client
    };
  }
}) satisfies PageLoad;
