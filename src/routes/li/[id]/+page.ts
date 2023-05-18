import { error } from '@sveltejs/kit';
import { Kind, nip19 } from 'nostr-tools';
import type { PageLoad } from './$types';
import { browser } from '$app/environment';
import RxNostrClient from '$lib/services/RxNostrClient';
import * as settings from '$lib/services/settings';
import { ensureAddressPointer } from '$lib/helper';

export const load = (({ params }) => {
  let data;
  try {
    data = nip19.decode(params.id).data;
  } catch {
    throw error(404, 'Not Found &#128148;');
  }

  if (!ensureAddressPointer(data) || data.kind != Kind.Article) {
    throw error(404, 'Not Found &#128148;');
  }

  let client: RxNostrClient | undefined;
  if (browser) {
    client = new RxNostrClient({ relays: settings.defaultRelays });
  }

  return {
    client,
    params: data
  };
}) satisfies PageLoad;
