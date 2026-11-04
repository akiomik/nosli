import { describe, expect, it } from 'vitest';

import { nsecOf, npubOf, noteOf, nprofileOf, publicKeyOf } from '#lib/testing/nostr.js';
import { readLoginKey } from './loginKey';

const secret = '7'.repeat(64);
const pubkey = publicKeyOf(secret);
// The order of the secp256k1 curve, one more than the largest secret key.
const curveOrder = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';

describe('readLoginKey', () => {
  it('reads an nsec as its pubkey and its secret key, both in hex', () => {
    expect(readLoginKey(nsecOf(secret))).toEqual({ pubkey, seckey: secret });
  });

  it('reads an nsec in uppercase', () => {
    expect(readLoginKey(nsecOf(secret).toUpperCase())).toEqual({ pubkey, seckey: secret });
  });

  it('reads an npub as its pubkey alone', () => {
    expect(readLoginKey(npubOf(pubkey))).toEqual({ pubkey });
  });

  it('does not read a key in hex, which is not NIP-19', () => {
    expect(readLoginKey(secret)).toBeUndefined();
    expect(readLoginKey(pubkey)).toBeUndefined();
  });

  it.each([undefined, '', 'nsec1', 'npub1invalid', 'not a key'])('does not read %j', (key) => {
    expect(readLoginKey(key)).toBeUndefined();
  });

  it('does not read an nsec whose checksum is wrong', () => {
    const nsec = nsecOf(secret);
    const typo = nsec.slice(0, -1) + (nsec.endsWith('q') ? 'p' : 'q');

    expect(readLoginKey(typo)).toBeUndefined();
  });

  it.each([
    ['0'.repeat(64), 'zero'],
    [curveOrder, 'the curve order']
  ])('does not read an nsec of %s (%s), which is not a secret key', (key) => {
    expect(readLoginKey(nsecOf(key))).toBeUndefined();
  });

  it('does not read an npub that is not 32 bytes', () => {
    expect(readLoginKey(npubOf(pubkey.slice(2)))).toBeUndefined();
    expect(readLoginKey(npubOf(pubkey + '00'))).toBeUndefined();
  });

  it('does not read an identifier of something other than a key', () => {
    expect(readLoginKey(noteOf(pubkey))).toBeUndefined();
    expect(readLoginKey(nprofileOf(pubkey, ['wss://relay.example.com']))).toBeUndefined();
  });
});
