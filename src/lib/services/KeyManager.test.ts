import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { publicKeyOf, signWith, type Event } from '#lib/testing/nostr.js';

vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

const hex = publicKeyOf('1'.repeat(64));
const extension = {
  getPublicKey: async () => hex,
  signEvent: vi.fn(),
  getRelays: async () => ({})
};

let KeyManager: typeof import('./KeyManager').default;
let Nip07MissingError: typeof import('./KeyManager').Nip07MissingError;
let Nip07CanceledError: typeof import('./KeyManager').Nip07CanceledError;
let nip07: typeof import('#lib/stores/cookie.js').nip07;
let pubkey: typeof import('#lib/stores/cookie.js').pubkey;
let seckey: typeof import('#lib/stores/cookie.js').seckey;
let loginMethod: typeof import('#lib/stores/login.js').loginMethod;

beforeEach(async () => {
  // The app starts now: KeyManager is loaded again under fake timers, so it waits from now.
  vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
  vi.resetModules();
  ({ default: KeyManager, Nip07MissingError, Nip07CanceledError } = await import('./KeyManager'));
  ({ nip07, pubkey, seckey } = await import('#lib/stores/cookie.js'));
  ({ loginMethod } = await import('#lib/stores/login.js'));
  vi.stubGlobal('window', {});
});

afterEach(() => {
  KeyManager.logout();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('KeyManager.getPublicKey with NIP-07', () => {
  it('waits for an extension that is added after the app starts', async () => {
    nip07.set(true);

    const key = KeyManager.getPublicKey();
    await vi.advanceTimersByTimeAsync(500);
    window.nostr = extension;
    await vi.advanceTimersByTimeAsync(100);

    await expect(key).resolves.toBe(hex);
  });

  it('fails once the app has run for 3 seconds without the extension', async () => {
    nip07.set(true);

    const key = KeyManager.getPublicKey();
    const failed = vi.fn();
    key.catch(failed);
    await vi.advanceTimersByTimeAsync(2900);
    expect(failed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);

    await expect(key).rejects.toBeInstanceOf(Nip07MissingError);
  });

  it('fails at once after that', async () => {
    nip07.set(true);
    await vi.advanceTimersByTimeAsync(3000);

    const failed = vi.fn();
    KeyManager.getPublicKey().catch(failed);
    await vi.advanceTimersByTimeAsync(0);

    expect(failed).toHaveBeenCalled();
  });
});

describe('KeyManager.getPublicKey with NIP-07, when the page arrived late', () => {
  it('still waits 3 seconds from when the app started', async () => {
    vi.advanceTimersByTime(5000);
    vi.resetModules();
    const LateKeyManager = (await import('./KeyManager')).default;
    (await import('#lib/stores/cookie.js')).nip07.set(true);

    const key = LateKeyManager.getPublicKey();
    await vi.advanceTimersByTimeAsync(2000);
    window.nostr = extension;
    await vi.advanceTimersByTimeAsync(100);

    await expect(key).resolves.toBe(hex);
  });
});

describe('KeyManager.getPublicKey with an extension that gives an invalid key', () => {
  it.each([['not hex'], ['A'.repeat(64)], [undefined]])('rejects %s', async (key) => {
    nip07.set(true);
    window.nostr = {
      getPublicKey: async () => key as string,
      signEvent: vi.fn(),
      getRelays: async () => ({})
    };

    await expect(KeyManager.getPublicKey()).rejects.toThrow('invalid public key');
    await expect(KeyManager.getNip07PublicKey()).rejects.toThrow('invalid public key');
  });
});

describe('KeyManager with a NIP-07 extension that has not answered', () => {
  // An extension whose prompt is left open, which answers only when told to.
  const openPrompt = () => {
    let giveKey = () => {};
    let giveSignature = () => {};
    const nostr = {
      getPublicKey: vi.fn(() => new Promise<string>((resolve) => (giveKey = () => resolve(hex)))),
      signEvent: vi.fn(
        (event: Pick<Event, 'kind' | 'tags' | 'content' | 'created_at'>) =>
          new Promise<Event>(
            (resolve) => (giveSignature = () => resolve(signWith('1'.repeat(64), event)))
          )
      ),
      getRelays: async () => ({})
    };
    window.nostr = nostr;
    nip07.set(true);
    return { nostr, giveKey: () => giveKey(), giveSignature: () => giveSignature() };
  };
  const unsigned = (): Event => ({
    id: '',
    sig: '',
    kind: 1,
    content: '',
    pubkey: '',
    created_at: 1,
    tags: []
  });

  it('stops waiting for the public key, and drops the key that comes later', async () => {
    const { nostr, giveKey } = openPrompt();
    const wait = new AbortController();

    const key = KeyManager.getPublicKey(wait.signal);
    const loggedInAs = KeyManager.isLoggedInAs(hex, wait.signal);
    await vi.waitFor(() => expect(nostr.getPublicKey).toHaveBeenCalledTimes(2));
    wait.abort();
    giveKey();

    await expect(key).rejects.toBeInstanceOf(Nip07CanceledError);
    await expect(loggedInAs).rejects.toBeInstanceOf(Nip07CanceledError);
  });

  it('stops waiting for a signature, and drops the signature that comes later', async () => {
    const { nostr, giveSignature } = openPrompt();
    const wait = new AbortController();

    const signed = KeyManager.signEvent(unsigned(), wait.signal);
    await vi.waitFor(() => expect(nostr.signEvent).toHaveBeenCalledOnce());
    wait.abort();
    giveSignature();

    await expect(signed).rejects.toBeInstanceOf(Nip07CanceledError);
  });

  it('does not ask the extension once the wait has been stopped', async () => {
    const { nostr } = openPrompt();
    const wait = new AbortController();
    wait.abort();

    await expect(KeyManager.getPublicKey(wait.signal)).rejects.toBeInstanceOf(Nip07CanceledError);
    await expect(KeyManager.signEvent(unsigned(), wait.signal)).rejects.toBeInstanceOf(
      Nip07CanceledError
    );
    expect(nostr.getPublicKey).not.toHaveBeenCalled();
    expect(nostr.signEvent).not.toHaveBeenCalled();
  });

  it('does not ask an extension that appears after the wait has been stopped', async () => {
    const { nostr } = openPrompt();
    window.nostr = undefined;
    const wait = new AbortController();

    const key = KeyManager.getPublicKey(wait.signal);
    const signed = KeyManager.signEvent(unsigned(), wait.signal);
    await vi.advanceTimersByTimeAsync(500);
    wait.abort();
    await expect(key).rejects.toBeInstanceOf(Nip07CanceledError);
    await expect(signed).rejects.toBeInstanceOf(Nip07CanceledError);
    window.nostr = nostr;
    await vi.advanceTimersByTimeAsync(100);

    expect(nostr.getPublicKey).not.toHaveBeenCalled();
    expect(nostr.signEvent).not.toHaveBeenCalled();
  });

  it('still fails when the extension refuses while the wait can be stopped', async () => {
    const refusal = new Error('User rejected');
    window.nostr = {
      getPublicKey: () => Promise.reject(refusal),
      signEvent: () => Promise.reject(refusal),
      getRelays: async () => ({})
    };
    nip07.set(true);
    const wait = new AbortController();

    await expect(KeyManager.getPublicKey(wait.signal)).rejects.toBe(refusal);
    await expect(KeyManager.signEvent(unsigned(), wait.signal)).rejects.toBe(refusal);
  });

  it('still gives the answer when the wait is not stopped', async () => {
    const { giveKey, giveSignature } = openPrompt();
    const wait = new AbortController();

    const key = KeyManager.getPublicKey(wait.signal);
    const signed = KeyManager.signEvent(unsigned(), wait.signal);
    await vi.advanceTimersByTimeAsync(0);
    giveKey();
    giveSignature();

    await expect(key).resolves.toBe(hex);
    await expect(signed).resolves.toMatchObject({ pubkey: hex });
  });
});

describe('KeyManager.hasNip07', () => {
  it('waits for an extension that is added after the app starts', async () => {
    const has = KeyManager.hasNip07();
    await vi.advanceTimersByTimeAsync(1000);
    window.nostr = extension;
    await vi.advanceTimersByTimeAsync(100);

    await expect(has).resolves.toBe(true);
  });

  it('is false once the app has run for 3 seconds without one', async () => {
    const has = KeyManager.hasNip07();
    await vi.advanceTimersByTimeAsync(3000);

    await expect(has).resolves.toBe(false);
  });
});

describe('KeyManager.logoutIfNip07Missing', () => {
  it('logs out a NIP-07 login without the extension', async () => {
    nip07.set(true);

    const loggedOut = KeyManager.logoutIfNip07Missing();
    await vi.advanceTimersByTimeAsync(3000);

    await expect(loggedOut).resolves.toBe(true);
    expect(get(loginMethod)).toBeUndefined();
  });

  it('keeps a NIP-07 login whose extension is added while the page loads', async () => {
    nip07.set(true);

    const loggedOut = KeyManager.logoutIfNip07Missing();
    await vi.advanceTimersByTimeAsync(1000);
    window.nostr = extension;
    await vi.advanceTimersByTimeAsync(100);

    await expect(loggedOut).resolves.toBe(false);
    expect(get(loginMethod)).toBe('nip07');
  });

  it('keeps a login with a key, and does not report a logout for a user who logged out meanwhile', async () => {
    seckey.set('1'.repeat(64));
    pubkey.set(hex);
    await expect(KeyManager.logoutIfNip07Missing()).resolves.toBe(false);
    expect(get(loginMethod)).toBe('nsec');

    KeyManager.logout();
    nip07.set(true);
    const loggedOut = KeyManager.logoutIfNip07Missing();
    nip07.set(false);
    await vi.advanceTimersByTimeAsync(3000);

    await expect(loggedOut).resolves.toBe(false);
    expect(get(loginMethod)).toBeUndefined();
  });
});

describe('loginMethod', () => {
  it('follows logging in and out', () => {
    expect(get(loginMethod)).toBeUndefined();
    pubkey.set(hex);
    expect(get(loginMethod)).toBe('npub');
    seckey.set('1'.repeat(64));
    expect(get(loginMethod)).toBe('nsec');
    KeyManager.logout();
    nip07.set(true);
    expect(get(loginMethod)).toBe('nip07');
    KeyManager.logout();
    expect(get(loginMethod)).toBeUndefined();
  });
});
