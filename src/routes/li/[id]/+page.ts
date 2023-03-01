import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import NostrClient from '$lib/services/NostrClient';
import Tag from '$lib/entities/Tag';

export const load = (async ({ params }) => {
  if (browser) {
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

    const profile = await client.getProfile(matome.pubkey);
    if (profile === undefined) {
      throw error(404, 'Not Found 💔');
    }

    // TODO: check ordering
    const asyncNotes = matome.eventIds().map(async (id: string) => client.getNote(id));
    const notes = await Promise.all(asyncNotes);

    return {
      id: params.id,
      matome,
      profile,
      notes,
      client
    };
  }
}) satisfies PageLoad;
