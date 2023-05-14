import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import RxNostrClient from '$lib/services/RxNostrClient';
import * as settings from '$lib/services/settings';
import { Kind, nip19 } from 'nostr-tools';
import type { AddressPointer } from 'nostr-tools/nip19';

export const load = (async ({ params }) => {
  let data;
  try {
    data = nip19.decode(params.id).data;
  } catch {
    throw error(404, 'Not Found 💔');
  }

  if (!ensureAddressPointer(data) || data.kind != Kind.Article) {
    throw error(404, 'Not Found 💔');
  }

  let client: RxNostrClient;
  if (browser) {
    client = new RxNostrClient({ relays: settings.defaultRelays });
  }

  return {
    client,
    params: data
  };
}) satisfies PageLoad;

function ensureAddressPointer(
  data: string | AddressPointer | ProfilePointer | EventPointer
): data is AddressPointer {
  if (typeof data === 'string') {
    return false;
  }

  return 'kind' in data && 'pubkey' in data && 'identifier' in data;
}
