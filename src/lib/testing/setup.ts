import { beforeEach } from 'vitest';

import { FakeWebSocket } from './FakeWebSocket';

// No test may connect to a real relay. nostr-tools can keep the WebSocket that it finds when it loads,
// so the fake one is in place before any test loads it.
globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

beforeEach(() => FakeWebSocket.reset());
