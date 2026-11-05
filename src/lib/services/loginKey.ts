import { nip19, getPublicKey, utils } from 'nostr-tools';

// A key to log in with: the pubkey, and the seckey of an nsec, both in hex as the cookies keep them.
export type LoginKey = { pubkey: string; seckey?: string };

// The key that the login form is given, or undefined for a key that cannot be used. nip19.decode
// takes an npub or nsec of any length. A pubkey is 32 bytes, and a secret key is a number from 1 to
// one less than the curve order, which getPublicKey checks.
export const readLoginKey = (key: string | undefined): LoginKey | undefined => {
  if (key === undefined) return undefined;

  try {
    const decoded = nip19.decode(key);
    if (decoded.type === 'nsec') {
      return { pubkey: getPublicKey(decoded.data), seckey: utils.bytesToHex(decoded.data) };
    }
    if (decoded.type === 'npub' && /^[0-9a-f]{64}$/.test(decoded.data)) {
      return { pubkey: decoded.data };
    }
  } catch {
    // Not NIP-19, or an nsec that is not a secret key.
  }
  return undefined;
};
