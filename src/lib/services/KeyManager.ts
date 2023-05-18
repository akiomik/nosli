import { get } from 'svelte/store';
import type { Event } from 'nostr-tools';
import { signEvent, getEventHash } from 'nostr-tools';
import { nip07, pubkey, seckey } from '$lib/stores/cookie';

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: Event) => Promise<Event>;
    };
  }
}

export default class KeyManager {
  private constructor() {
    // noop
  }

  static async getPublicKey(): Promise<string> {
    if (get(nip07)) {
      if (!window.nostr) {
        return Promise.reject(new Error('Failed to resolve NIP-07'));
      }

      return window.nostr.getPublicKey();
    } else {
      return get(pubkey);
    }
  }

  static async signEvent(event: Event): Promise<Event> {
    if (get(nip07)) {
      if (!window.nostr) {
        return Promise.reject(new Error('Failed to resolve NIP-07'));
      }

      return window.nostr.signEvent(event);
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

  static isLoggedInWithPublicKey(): boolean {
    return get(pubkey) !== '' && get(seckey) === '';
  }

  static isLoggedInWithSecretKey(): boolean {
    return get(seckey) !== '';
  }

  static logout() {
    pubkey.set('');
    seckey.set('');
    nip07.set(false);
  }
}
