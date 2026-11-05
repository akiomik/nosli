import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getPublicKey,
  nip19,
  SimplePool,
  utils,
  verifyEvent,
  type Event,
  type EventTemplate,
  type Filter
} from 'nostr-tools';

// Test helpers that hide how nostr-tools takes and gives keys and events, so that the tests that use
// them stay the same when it changes. Keys are hex, as Nosli stores them.

// The kinds that Nosli reads and writes, by number, as NIP-01, NIP-09, NIP-23 and NIP-25 give them.
export const KIND = { metadata: 0, text: 1, deletion: 5, reaction: 7, article: 30023 } as const;

export type { Event, EventTemplate, Filter };

// nostr-tools marks an event that it signed or checked as verified, which a copy keeps. Events from
// relays and extensions come as JSON, without the mark.
const asJson = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const newSecretKey = (): string => utils.bytesToHex(generateSecretKey());

export const publicKeyOf = (secretKey: string): string => getPublicKey(utils.hexToBytes(secretKey));

export const signWith = (secretKey: string, template: EventTemplate): Event =>
  asJson(finalizeEvent(template, utils.hexToBytes(secretKey)));

// Whether the ID of an event is its hash, and its signature is that of its pubkey.
export const isSigned = (event: Event): boolean => {
  try {
    const copy = asJson(event);
    return getEventHash(copy) === copy.id && verifyEvent(copy);
  } catch {
    return false;
  }
};

export const nsecOf = (secretKey: string): string => nip19.nsecEncode(utils.hexToBytes(secretKey));
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
