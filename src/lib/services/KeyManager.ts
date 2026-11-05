import { get } from 'svelte/store';
import type { Event } from 'nostr-tools';
import { finalizeEvent, utils } from 'nostr-tools';
import { nip07, pubkey, seckey } from '#lib/stores/cookie.js';

// The part of a NIP-07 extension that this app uses. rx-nostr declares window.nostr for the whole
// app, and a second declaration would have to match it exactly.
type Nip07 = {
  getPublicKey: () => Promise<string>;
  signEvent: (event: Event) => Promise<Event>;
};

// NIP-07 extensions add window.nostr while the page loads, which can be after the app starts, so a
// missing one is waited for until this long after the app started.
const NIP07_WAIT_MS = 3000;
const NIP07_POLL_MS = 100;
// When the app loaded this module, which is after the page itself arrived, however long that took.
const startedAt = performance.now();

// The NIP-07 extension was waited for and did not appear, as when it was removed after logging in.
export class Nip07MissingError extends Error {
  constructor() {
    super('Failed to resolve NIP-07');
  }
}

// The user stopped waiting for the NIP-07 extension, which may never answer, for example while its
// prompt is left open.
export class Nip07CanceledError extends Error {
  constructor() {
    super('Stopped waiting for NIP-07');
  }
}

// The answer of a NIP-07 call, or a Nip07CanceledError once `signal` aborts. The extension cannot be
// told to stop, so an answer that comes later is dropped.
const unlessCanceled = <T>(call: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (signal?.aborted) return Promise.reject(new Nip07CanceledError());
  if (!signal) return call();

  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(new Nip07CanceledError());
    signal.addEventListener('abort', cancel, { once: true });
    call()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', cancel));
  });
};

export default class KeyManager {
  private constructor() {
    // noop
  }

  private static async nip07(): Promise<Nip07> {
    while (!window.nostr && performance.now() < startedAt + NIP07_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, NIP07_POLL_MS));
    }
    if (!window.nostr) {
      throw new Nip07MissingError();
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

  // Asks the NIP-07 extension, unless `signal` aborts first, as it can while the extension is still
  // being waited for.
  private static askNip07<T>(ask: (nostr: Nip07) => Promise<T>, signal?: AbortSignal): Promise<T> {
    return unlessCanceled(async () => {
      const nostr = await KeyManager.nip07();
      if (signal?.aborted) throw new Nip07CanceledError();
      return ask(nostr);
    }, signal);
  }

  // The public key that the NIP-07 extension gives, which goes into npub links and is compared with
  // event authors. `signal` stops waiting for it.
  static async getNip07PublicKey(signal?: AbortSignal): Promise<string> {
    const key = await KeyManager.askNip07((nostr) => nostr.getPublicKey(), signal);
    if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key)) {
      throw new Error('The NIP-07 extension gave an invalid public key');
    }
    return key;
  }

  static async getPublicKey(signal?: AbortSignal): Promise<string> {
    if (get(nip07)) {
      return KeyManager.getNip07PublicKey(signal);
    } else {
      return get(pubkey);
    }
  }

  // `signal` stops waiting for a NIP-07 extension to sign.
  static async signEvent(event: Event, signal?: AbortSignal): Promise<Event> {
    if (get(nip07)) {
      return KeyManager.askNip07((nostr) => nostr.signEvent(event), signal);
    } else {
      const signed = finalizeEvent(event, utils.hexToBytes(get(seckey)));
      // finalizeEvent signs as the account of the secret key, which is that of the login unless the
      // cookies were changed by hand. Such an event would be published under another account.
      if (signed.pubkey !== get(pubkey)) {
        throw new Error('The secret key is not that of the logged-in account');
      }
      return signed;
    }
  }

  static async isLoggedInAs(pubkey: string, signal?: AbortSignal): Promise<boolean> {
    if (!KeyManager.isLoggedIn()) {
      return false;
    }

    const key = await KeyManager.getPublicKey(signal);
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
