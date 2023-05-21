import { error } from '@sveltejs/kit';
import KeyManager from '$lib/services/KeyManager';

export const load = () => {
  if (!KeyManager.isLoggedIn() || KeyManager.isLoggedInWithPublicKey()) {
    throw error(401, 'Unauthorized &#128581;');
  }
};
