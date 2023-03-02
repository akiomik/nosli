import { nip19 } from 'nostr-tools';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import NostrClient from '$lib/services/NostrClient';

export const load = (async ({ params }) => {
  if (browser) {
    const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);
    await client.connect();

    let pubkey: string;
    try {
      pubkey = nip19.decode(params.id).data;
    } catch {
      throw error(404, 'Not Found 💔');
    }

    if (typeof pubkey !== 'string') {
      throw error(500, 'Internal Server Error');
    }

    const profile = await client.getProfile(pubkey);
    if (profile === undefined) {
      throw error(404, 'Not Found 💔');
    }

    const matomes = await client.listMatomes(pubkey);

    return {
      id: params.id,
      profile,
      matomes,
      client
    };
  }
}) satisfies PageLoad;
