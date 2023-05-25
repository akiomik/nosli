import { error } from '@sveltejs/kit';
import KeyManager from '$lib/services/KeyManager';

export const load = () => {
  if (!KeyManager.isWritableLoggedIn()) {
    throw error(401, 'Unauthorized &#128581;');
  }
};
