import { nip19 } from 'nostr-tools';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import NostrClient from '$lib/services/NostrClient';

export const load = (async ({ params }) => {
  if (browser) {
    let profile: Profile;

    const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);
    await client.connect();

    try {
      const pubkey = nip19.decode(params.id).data;
      if (typeof pubkey !== 'string') {
        throw new Error();
      }

      const profileOpt = await client.getProfile(pubkey);
      if (profileOpt === undefined) {
        throw new Error();
      }
      profile = profileOpt;
    } catch (e) {
      throw error(404, 'Not Found 💔');
    }

    return {
      id: params.id,
      profile,
      client
    };
  }
}) satisfies PageLoad;
