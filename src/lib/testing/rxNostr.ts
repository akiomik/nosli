import { Subject, throwError } from 'rxjs';
import type { ConnectionState, RxNostr } from 'rx-nostr';

import { createClient } from '#lib/stores/client.js';

// Test helpers that hide how rx-nostr is set up and how it names the state of a connection, so that
// the tests that use them stay the same when it changes. The relays are fake ones (FakeWebSocket).

export type { RxNostr };

const clients: RxNostr[] = [];

// A client that reads from and writes to `relays`, as the app sets it up.
export const clientOf = (relays: string[]): RxNostr => {
  const client = createClient(relays);
  clients.push(client);
  return client;
};

// A client without relays whose every request fails with `error`.
export const failingClient = (error: Error): RxNostr =>
  Object.assign(clientOf([]), { use: () => throwError(() => error) });

// A client whose relays send `messages`, the only part of a client that orMissing and withEnd
// watch, and the message that a relay sends when it has answered a request.
export const fakeClient = () => {
  const messages = new Subject<{ from: string; message: unknown[] }>();
  const client = {
    createAllMessageObservable: () => messages.asObservable()
  } as unknown as RxNostr;
  return { client, messages };
};

export const eose = (from: string) => ({ from, message: ['EOSE', 'sub'] });

// Closes every client that clientOf made.
export const disposeClients = () => {
  for (const client of clients.splice(0)) client.dispose();
};

// What a state of a connection means to a page.
export type Status = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed';

export const statusOf = (state: ConnectionState): Status =>
  (
    ({
      initialized: 'idle',
      connecting: 'connecting',
      connected: 'connected',
      'waiting-for-retrying': 'connecting',
      retrying: 'connecting',
      dormant: 'idle',
      error: 'failed',
      rejected: 'failed',
      terminated: 'closed'
    }) as const
  )[state];
