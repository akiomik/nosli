import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import NostrClient from '$lib/services/NostrClient';
import * as settings from '$lib/services/settings';

export const load = (async ({ params }) => {
  if (browser) {
    const client = new NostrClient(settings.defaultRelays);
    await client.connect();

    let matome: LongFormContent | undefined;
    try {
      matome = await client.getMatome(params.id);
    } catch (e) {
      if (e instanceof TypeError) {
        throw error(404, 'Not Found 💔');
      } else {
        throw error(500, 'Internal Server Error');
      }
    }

    if (matome === undefined) {
      throw error(404, 'Not Found 💔');
    }

    const profile = await client.getProfile(matome.pubkey);
    if (profile === undefined) {
      throw error(404, 'Not Found 💔');
    }

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
