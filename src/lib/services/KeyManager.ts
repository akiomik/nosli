import { get } from 'svelte/store';
import type { Event } from 'nostr-tools';
import { signEvent, getEventHash } from 'nostr-tools';
import { nip07, pubkey, seckey } from '$lib/stores/cookie';

type Nip07 = {
  getPublicKey: () => Promise<string>;
  signEvent: (event: Event) => Promise<Event>;
};

declare global {
  interface Window {
    nostr?: Nip07;
  }
}

// NIP-07 extensions add window.nostr while the page loads, which can be after the app starts, so a
// missing one is waited for until this long after the app started.
const NIP07_WAIT_MS = 3000;
const NIP07_POLL_MS = 100;
// When the app loaded this module, which is after the page itself arrived, however long that took.
const startedAt = performance.now();

export default class KeyManager {
  private constructor() {
    // noop
  }

  private static async nip07(): Promise<Nip07> {
    while (!window.nostr && performance.now() < startedAt + NIP07_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, NIP07_POLL_MS));
    }
    if (!window.nostr) {
      throw new Error('Failed to resolve NIP-07');
    }

    return window.nostr;
  }

  // Whether this browser has a NIP-07 extension, waiting for one that is still loading.
  static async hasNip07(): Promise<boolean> {
    return KeyManager.nip07().then(
      () => true,
      () => false
    );
  }

  // The public key that the NIP-07 extension gives, which goes into npub links and is compared with
  // event authors.
  static async getNip07PublicKey(): Promise<string> {
    const key = await (await KeyManager.nip07()).getPublicKey();
    if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key)) {
      throw new Error('The NIP-07 extension gave an invalid public key');
    }
    return key;
  }

  static async getPublicKey(): Promise<string> {
    if (get(nip07)) {
      return KeyManager.getNip07PublicKey();
    } else {
      return get(pubkey);
    }
  }

  static async signEvent(event: Event): Promise<Event> {
    if (get(nip07)) {
      return (await KeyManager.nip07()).signEvent(event);
    } else {
      event.pubkey = get(pubkey);
      event.id = getEventHash(event);
      event.sig = signEvent(event, get(seckey));
      return event;
    }
  }

  static async isLoggedInAs(pubkey: string): Promise<boolean> {
    if (!KeyManager.isLoggedIn()) {
      return false;
    }

    const key = await KeyManager.getPublicKey();
    return pubkey === key;
  }

  static isLoggedIn(): boolean {
    return KeyManager.isLoggedInWithNip07() || KeyManager.isLoggedInWithKey();
  }

  static isLoggedInWithNip07(): boolean {
    return get(nip07);
  }

  static isLoggedInWithKey(): boolean {
    return get(pubkey) !== '';
  }

  static isLoggedInWithSecretKey(): boolean {
    return get(seckey) !== '';
  }

  static isWritableLoggedIn(): boolean {
    return KeyManager.isLoggedInWithNip07() || KeyManager.isLoggedInWithSecretKey();
  }

  static logout() {
    pubkey.set('');
    seckey.set('');
    nip07.set(false);
  }

  // Logs out a NIP-07 login whose extension this browser does not have, for example after it was
  // removed. Returns whether it logged out.
  static async logoutIfNip07Missing(): Promise<boolean> {
    if (!KeyManager.isLoggedInWithNip07()) return false;

    try {
      await KeyManager.nip07();
      return false;
    } catch {
      // The user may have logged out while it was waited for.
      if (!KeyManager.isLoggedInWithNip07()) return false;
      KeyManager.logout();
      return true;
    }
  }
}
