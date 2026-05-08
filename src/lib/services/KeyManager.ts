import { get } from 'svelte/store';
import type { Event } from 'nostr-tools';
import { nip07, pubkey } from '$lib/stores/cookie';

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
    if (KeyManager.isLoggedInWithNip07() && window.nostr) {
      return window.nostr.getPublicKey();
    }
    return get(pubkey);
  }

  static async signEvent(event: Event): Promise<Event> {
    if (!KeyManager.isLoggedInWithNip07() || !window.nostr) {
      return Promise.reject(new Error('Signing requires NIP-07'));
    }

    return window.nostr.signEvent(event);
  }

  static async isLoggedInAs(pubkey: string): Promise<boolean> {
    if (!KeyManager.isLoggedIn()) {
      return false;
    }

    const key = await KeyManager.getPublicKey();
    return pubkey === key;
  }

  static isLoggedIn(): boolean {
    return KeyManager.isLoggedInWithNip07() || KeyManager.isLoggedInWithPublicKey();
  }

  static isLoggedInWithNip07(): boolean {
    return get(nip07) && typeof window !== 'undefined' && !!window.nostr;
  }

  static isLoggedInWithPublicKey(): boolean {
    return !get(nip07) && get(pubkey) !== '';
  }

  static isWritableLoggedIn(): boolean {
    return KeyManager.isLoggedInWithNip07();
  }

  static logout() {
    pubkey.set('');
    nip07.set(false);
  }
}
