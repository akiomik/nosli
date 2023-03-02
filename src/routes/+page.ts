import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import NostrClient from '$lib/services/NostrClient';
import * as settings from '$lib/services/settings';

export const load = (async () => {
  if (browser) {
    const client = new NostrClient(settings.defaultRelays);
    await client.connect();

    const matomes = await client.listGlobalMatomes(25);

    return {
      matomes,
      client
    };
  }
}) satisfies PageLoad;
