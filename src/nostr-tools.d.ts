// nostr-tools v1 ships TypeScript sources but does not expose them via package exports.
declare module 'nostr-tools' {
  export type Event = import('../node_modules/nostr-tools/event').Event;
  export type Pub = import('../node_modules/nostr-tools/relay').Pub;
  export const Kind: typeof import('../node_modules/nostr-tools/event').Kind;
  export const SimplePool: typeof import('../node_modules/nostr-tools/pool').SimplePool;
  export const nip19: typeof import('../node_modules/nostr-tools/nip19');
  export const nip05: typeof import('../node_modules/nostr-tools/nip05');
  export const getPublicKey: typeof import('../node_modules/nostr-tools/keys').getPublicKey;
  export const validateEvent: typeof import('../node_modules/nostr-tools/event').validateEvent;
  export const verifySignature: typeof import('../node_modules/nostr-tools/event').verifySignature;
  export const signEvent: typeof import('../node_modules/nostr-tools/event').signEvent;
  export const getEventHash: typeof import('../node_modules/nostr-tools/event').getEventHash;
}

declare module 'nostr-tools/nip19' {
  export type AddressPointer = import('../node_modules/nostr-tools/nip19').AddressPointer;
  export type EventPointer = import('../node_modules/nostr-tools/nip19').EventPointer;
  export type ProfilePointer = import('../node_modules/nostr-tools/nip19').ProfilePointer;
}
