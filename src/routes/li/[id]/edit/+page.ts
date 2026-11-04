import { error } from '@sveltejs/kit';
import { kinds, nip19 } from 'nostr-tools';
import type { PageLoad } from './$types';
import KeyManager from '#lib/services/KeyManager.js';
import { ensureAddressPointer } from '#lib/helper.js';
import { LOGIN_DEPENDENCY } from '#lib/stores/login.js';

export const load = (({ params, depends }) => {
  depends(LOGIN_DEPENDENCY);
  let data;
  try {
    data = nip19.decode(params.id).data;
  } catch {
    throw error(404, 'Not Found 💔');
  }

  if (!ensureAddressPointer(data) || data.kind != kinds.LongFormArticle) {
    throw error(404, 'Not Found 💔');
  }

  if (!KeyManager.isWritableLoggedIn()) {
    throw error(401, 'Unauthorized 🙅');
  }

  return {
    params: data
  };
}) satisfies PageLoad;
