import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import KeyManager from '$lib/services/KeyManager';

export function load() {
  if (browser && KeyManager.isLoggedInWithPublicKey()) {
    throw error(401, '/');
  }
}
