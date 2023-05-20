import { error } from '@sveltejs/kit';
import { nip19 } from 'nostr-tools';
import type { PageLoad } from './$types';

export const load = (async ({ params }) => {
  let pubkey: string;
  try {
    pubkey = nip19.decode(params.id).data;
  } catch {
    throw error(404, 'Not Found &#128148;');
  }

  if (typeof pubkey !== 'string') {
    throw error(500, 'Internal Server Error &#129327;');
  }

  return {
    pubkey
  };
}) satisfies PageLoad;
