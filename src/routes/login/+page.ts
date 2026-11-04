import { redirect } from '@sveltejs/kit';
import { nip19 } from 'nostr-tools';
import { browser } from '$app/environment';
import type { PageLoad } from './$types';
import KeyManager from '$lib/services/KeyManager';
import { LOGIN_DEPENDENCY } from '$lib/stores/login';

// The profile page of the logged-in user, or undefined to show the login form instead. The NIP-07
// extension can be missing or refuse, and the key from it or the cookie may not be hex.
const profilePath = async (): Promise<string | undefined> => {
  try {
    return `/p/${nip19.npubEncode(await KeyManager.getPublicKey())}`;
  } catch {
    return undefined;
  }
};

// Logged-in users go to their profile page. A NIP-07 extension can take seconds to appear or to
// answer, and the page would stay blank while the load waits, so the page waits for it instead.
export const load = (async ({ depends }) => {
  depends(LOGIN_DEPENDENCY);
  if (!browser || !KeyManager.isLoggedIn()) return { profile: undefined };
  if (KeyManager.isLoggedInWithNip07()) return { profile: profilePath() };

  const path = await profilePath();
  if (path) throw redirect(302, path);
  return { profile: undefined };
}) satisfies PageLoad;
