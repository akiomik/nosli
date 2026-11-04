import { derived } from 'svelte/store';

import { nip07, pubkey, seckey } from '#lib/stores/cookie.js';

// How the user is logged in, kept up to date as they log in and out. A public key alone can only
// read, while NIP-07 and a secret key can also sign.
export type LoginMethod = 'nip07' | 'nsec' | 'npub';

// The loads that read the login depend on this, so that they alone run again when it changes
// without a navigation, such as when the layout logs out a NIP-07 login without its extension.
export const LOGIN_DEPENDENCY = 'nosli:login';

export const loginMethod = derived(
  [nip07, pubkey, seckey],
  ([$nip07, $pubkey, $seckey]): LoginMethod | undefined => {
    if ($nip07) return 'nip07';
    if ($seckey !== '') return 'nsec';
    if ($pubkey !== '') return 'npub';
    return undefined;
  }
);
