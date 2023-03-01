import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import NostrClient from '$lib/services/NostrClient';
import Tag from '$lib/entities/Tag';

export const load = (async ({ params }) => {
  if (browser) {
    const client = new NostrClient(['wss://relay.damus.io', 'wss://relay.snort.social']);
    await client.connect();
    let matome: LongFormContent;
    let profile: Profile;
    let notes: Note[];

    try {
      const matomeOpt = await client.getLongFormContent(params.id);
      if (matomeOpt === undefined) {
        throw new Error();
      }

      matome = matomeOpt;
      if (!matome.includesTag(new Tag('t', 'nosli'))) {
        throw new Error();
      }

      const profileOpt = await client.getProfile(matome.pubkey);
      if (profileOpt === undefined) {
        throw new Error();
      }
      profile = profileOpt;

      // TODO: check ordering
      const asyncNotes = matome.eventIds().map(async (id: string) => {
        const note = await client.getNote(id);
        note.asyncProfile = client.getProfile(note.pubkey);
        return note;
      });
      notes = await Promise.all(asyncNotes);
    } catch {
      throw error(404, 'Not Found 💔');
    }

    return {
      id: params.id,
      matome,
      profile,
      notes,
      client
    };
  }
}) satisfies PageLoad;
