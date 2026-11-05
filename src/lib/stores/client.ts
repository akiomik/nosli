import { createRxNostr, noopVerifier } from 'rx-nostr';
import type { RxNostr } from 'rx-nostr';

// A client of rx-nostr that reads from `relays`, and writes to those that are not read-only. Nosli
// publishes through NostrClient, so it only reads through this one.
export function createClient(relays: (string | { url: string; read: boolean; write: boolean })[]) {
  const client: RxNostr = createRxNostr({
    // Nosli checks every event itself, as requestedEvents does, including its signature, the filters
    // of the request and its expiration. rx-nostr would check it before Nosli looks at what it is,
    // and a relay that sent something other than an event would make the request fail.
    verifier: noopVerifier,
    skipVerify: true,
    skipValidateFilterMatching: true,
    skipExpirationCheck: true,
    // rx-nostr would ask every relay for its NIP-11 information over HTTP, only to queue the
    // subscriptions beyond its limit.
    skipFetchNip11: true,
    // Connects to the relays at once, and keeps the connections open between requests. rx-nostr
    // starts a timer that closes an idle connection before it marks the relay as a default one, and
    // does not stop it after. Without a timeout, it closes the connection at that point instead,
    // when there is none open yet.
    connectionStrategy: 'aggressive',
    disconnectTimeout: 0,
    // A relay whose connection failed is not connected to again by itself.
    retry: { strategy: 'off' }
  });
  client.setDefaultRelays(relays);
  return client;
}
