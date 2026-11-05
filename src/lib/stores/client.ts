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
    // A relay whose connection failed is connected to again when Nosli next asks the relays
    // something, through reconnectFailedRelays, not on a timer. While rx-nostr waits to retry, which
    // takes up to seconds, it holds a request to the relay until the retry, the request ends only at
    // its timeout, and reconnect() cannot cut the wait short.
    retry: { strategy: 'off' }
  });
  client.setDefaultRelays(relays);
  return client;
}

// Connects again to the relays that the client reads from whose connection failed. A request to such
// a relay waits for the connection, and is sent once it opens. This includes a relay that closed the
// connection with code 4000 (rejected), which rx-nostr takes as asking it not to connect again, but
// no NIP does; rx-nostr 0.9 connected to it again for the next request too.
export function reconnectFailedRelays(client: RxNostr) {
  for (const [url, { connection }] of Object.entries(client.getAllRelayStatus())) {
    const failed = connection === 'error' || connection === 'rejected';
    if (failed && client.getDefaultRelay(url)?.read) client.reconnect(url);
  }
}

// Connects again to the relays whose connection failed once the browser is back online, so that the
// relays are up for the next request, and the header shows them as connected. Returns the function
// that stops it.
export function reconnectWhenOnline(client: RxNostr, target: EventTarget = window): () => void {
  const reconnect = () => reconnectFailedRelays(client);
  target.addEventListener('online', reconnect);
  return () => target.removeEventListener('online', reconnect);
}
