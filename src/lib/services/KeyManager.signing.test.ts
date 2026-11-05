import { afterEach, describe, expect, it, vi } from 'vitest';

import { pubkey, seckey } from '#lib/stores/cookie.js';
import { KIND, isSigned, publicKeyOf } from '#lib/testing/nostr.js';
import KeyManager from './KeyManager';

// Signing with the secret key that the cookies keep in hex, as the login form stores it.

vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

const secret = '7'.repeat(64);
const unsigned = () => ({
  id: '',
  sig: '',
  pubkey: '',
  kind: KIND.article,
  content: 'nostr:note1',
  created_at: 1_700_000_000,
  tags: [
    ['d', 'my-list'],
    ['t', 'nosli']
  ]
});

afterEach(() => {
  KeyManager.logout();
});

describe('KeyManager.signEvent with a secret key', () => {
  it('signs the event as the logged-in account, with its ID and signature', async () => {
    seckey.set(secret);
    pubkey.set(publicKeyOf(secret));

    const event = await KeyManager.signEvent(unsigned());

    const { kind, content, created_at, tags } = unsigned();
    expect(event).toMatchObject({ kind, content, created_at, tags, pubkey: publicKeyOf(secret) });
    expect(event.id).toMatch(/^[0-9a-f]{64}$/);
    expect(event.sig).toMatch(/^[0-9a-f]{128}$/);
    expect(isSigned(event)).toBe(true);
  });

  it('gives events that differ in anything different IDs', async () => {
    seckey.set(secret);
    pubkey.set(publicKeyOf(secret));

    const first = await KeyManager.signEvent(unsigned());
    const second = await KeyManager.signEvent({ ...unsigned(), content: 'other' });

    expect(first.id).not.toBe(second.id);
  });

  it('gives a signature that does not hold for another account', async () => {
    seckey.set(secret);
    pubkey.set(publicKeyOf(secret));

    const event = await KeyManager.signEvent(unsigned());

    expect(isSigned({ ...event, pubkey: publicKeyOf('8'.repeat(64)) })).toBe(false);
    expect(isSigned({ ...event, content: 'changed' })).toBe(false);
  });
});
