import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import * as settings from '$lib/services/settings';
import RxNostrClient from '$lib/services/RxNostrClient';

export const load = (async () => {
  if (browser) {
    const client = new RxNostrClient({ relays: settings.defaultRelays });

    return { client };
  }
}) satisfies PageLoad;
