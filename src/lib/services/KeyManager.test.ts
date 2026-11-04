import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { getPublicKey } from 'nostr-tools';

vi.mock('$lib/stores/cookie', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

const hex = getPublicKey('1'.repeat(64));
const extension = { getPublicKey: async () => hex, signEvent: vi.fn() };

let KeyManager: typeof import('./KeyManager').default;
let nip07: typeof import('$lib/stores/cookie').nip07;
let pubkey: typeof import('$lib/stores/cookie').pubkey;
let seckey: typeof import('$lib/stores/cookie').seckey;
let loginMethod: typeof import('$lib/stores/login').loginMethod;

beforeEach(async () => {
  // The app starts now: KeyManager is loaded again under fake timers, so it waits from now.
  vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
  vi.resetModules();
  KeyManager = (await import('./KeyManager')).default;
  ({ nip07, pubkey, seckey } = await import('$lib/stores/cookie'));
  ({ loginMethod } = await import('$lib/stores/login'));
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

    await expect(key).rejects.toThrow('Failed to resolve NIP-07');
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
    (await import('$lib/stores/cookie')).nip07.set(true);

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
    window.nostr = { getPublicKey: async () => key as string, signEvent: vi.fn() };

    await expect(KeyManager.getPublicKey()).rejects.toThrow('invalid public key');
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
