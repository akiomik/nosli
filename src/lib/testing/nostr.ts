import {
  finishEvent,
  generatePrivateKey,
  getEventHash,
  getPublicKey,
  nip19,
  SimplePool,
  verifySignature,
  type Event,
  type EventTemplate,
  type Filter
} from 'nostr-tools';

// Test helpers that hide how nostr-tools takes and gives keys and events, so that the tests that use
// them stay the same when it changes. Keys are hex, as Nosli stores them.

// The kinds that Nosli reads and writes, by number, as NIP-01, NIP-09, NIP-23 and NIP-25 give them.
export const KIND = { metadata: 0, text: 1, deletion: 5, reaction: 7, article: 30023 } as const;

export type { Event, EventTemplate, Filter };

export const newSecretKey = (): string => generatePrivateKey();

export const publicKeyOf = (secretKey: string): string => getPublicKey(secretKey);

export const signWith = (secretKey: string, template: EventTemplate): Event =>
  finishEvent(template, secretKey);

// Whether the ID of an event is its hash, and its signature is that of its pubkey.
export const isSigned = (event: Event): boolean => {
  try {
    return getEventHash(event) === event.id && verifySignature(event);
  } catch {
    return false;
  }
};

export const nsecOf = (secretKey: string): string => nip19.nsecEncode(secretKey);
export const npubOf = (pubkey: string): string => nip19.npubEncode(pubkey);
export const noteOf = (id: string): string => nip19.noteEncode(id);
export const nprofileOf = (pubkey: string, relays?: string[]): string =>
  nip19.nprofileEncode({ pubkey, relays });
export const neventOf = (id: string, relays?: string[]): string =>
  nip19.neventEncode({ id, relays });
export const naddrOf = (pointer: {
  kind: number;
  pubkey: string;
  identifier: string;
  relays?: string[];
}): string => nip19.naddrEncode(pointer);

// A pool of nostr-tools that is connected to each relay, as NostrClient has it before publishing.
export const connectedPool = async (urls: string[]): Promise<SimplePool> => {
  const pool = new SimplePool();
  await Promise.all(urls.map((url) => pool.ensureRelay(url)));
  return pool;
};
