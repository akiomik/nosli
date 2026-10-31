import { error } from '@sveltejs/kit';
import { nip19 } from 'nostr-tools';
import type { PageLoad } from './$types';

export const load = (async ({ params }) => {
  let decoded: ReturnType<typeof nip19.decode>;
  try {
    decoded = nip19.decode(params.id);
  } catch {
    throw error(404, 'Not Found &#128148;');
  }

  if (decoded.type !== 'npub' || typeof decoded.data !== 'string') {
    throw error(404, 'Not Found &#128148;');
  }

  return {
    pubkey: decoded.data
  };
}) satisfies PageLoad;
