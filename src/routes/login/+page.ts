import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { pubkey, seckey } from '$lib/stores/cookie';
import { nip19 } from 'nostr-tools';

export const load = async () => {
  if (browser) {
    if (get(seckey) !== '' && get(pubkey) !== '') {
      throw redirect(302, `/p/${nip19.npubEncode(get(pubkey))}`);
    }
  }
};
