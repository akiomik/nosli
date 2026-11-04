import { error } from '@sveltejs/kit';
import { Kind, nip19 } from 'nostr-tools';
import type { PageLoad } from './$types';
import { ensureAddressPointer } from '$lib/helper';

export const load = (({ params }) => {
  let data;
  try {
    data = nip19.decode(params.id).data;
  } catch {
    throw error(404, 'Not Found 💔');
  }

  if (!ensureAddressPointer(data) || data.kind != Kind.Article) {
    throw error(404, 'Not Found 💔');
  }

  return {
    params: data
  };
}) satisfies PageLoad;
