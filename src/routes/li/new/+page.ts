import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import KeyManager from '$lib/services/KeyManager';
import { LOGIN_DEPENDENCY } from '$lib/stores/login';

export const load = (({ depends }) => {
  depends(LOGIN_DEPENDENCY);
  if (!KeyManager.isWritableLoggedIn()) {
    throw error(401, 'Unauthorized 🙅');
  }
}) satisfies PageLoad;
