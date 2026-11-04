import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LongFormContent from '#lib/entities/LongFormContent.js';
import KeyManager from './KeyManager';
import NostrClient from './NostrClient';
import { FakeWebSocket, setOpenDelay, setRelayBehavior } from '#lib/testing/FakeWebSocket.js';
import { publicKeyOf, type Event } from '#lib/testing/nostr.js';

vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  const { publicKeyOf } = await import('#lib/testing/nostr.js');
  const secret = '1'.repeat(64);
  return {
    nip07: writable(false),
    pubkey: writable(publicKeyOf(secret)),
    seckey: writable(secret)
  };
});

function article(id?: string) {
  return new LongFormContent(
    id,
    'test',
    publicKeyOf('1'.repeat(64)),
    'content',
    new Date(),
    'title',
    '',
    undefined,
    undefined,
    []
  );
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NostrClient with real SimplePool and fake WebSocket', () => {
  it('reports the configured URL of a relay that never connected', async () => {
    setRelayBehavior('wss://down.example/', 'refuse');
    const client = new NostrClient(['wss://ok.example', 'wss://down.example'], 30);
    try {
      const result = await client.postLongFormContent(article());
      expect(result.publication).toEqual({
        acceptedRelays: ['wss://ok.example'],
        rejectedRelays: [],
        timedOutRelays: [],
        unavailableRelays: ['wss://down.example']
      });
      expect(FakeWebSocket.instances[0].url).toBe('wss://ok.example/');
    } finally {
      await client.close();
    }
  });

  it('starts signing before a silent secondary relay times out', async () => {
    setRelayBehavior('wss://silent.example/', 'hang');
    const signEvent = vi.spyOn(KeyManager, 'signEvent');
    const client = new NostrClient(['wss://ok.example', 'wss://silent.example'], 2000);
    try {
      const publication = client.postLongFormContent(article());
      await vi.waitFor(() => expect(signEvent).toHaveBeenCalledOnce(), { timeout: 500 });
      await expect(publication).resolves.toMatchObject({
        publication: {
          acceptedRelays: ['wss://ok.example'],
          unavailableRelays: ['wss://silent.example']
        }
      });
    } finally {
      await client.close();
    }
  });

  it('publishes to a relay that reconnects shortly after immediate signing', async () => {
    const client = new NostrClient(['wss://one.example', 'wss://two.example']);
    try {
      await client.connect();
      setOpenDelay('wss://two.example/', 40);
      FakeWebSocket.instances[1].close();

      const result = await client.postLongFormContent(article());
      expect(result.publication.acceptedRelays).toEqual(['wss://one.example', 'wss://two.example']);
      expect(result.publication.unavailableRelays).toEqual([]);
      expect(FakeWebSocket.instances[2].sent.some((message) => message.includes('"EVENT"'))).toBe(
        true
      );
    } finally {
      await client.close();
    }
  });

  it('retries a relay that disconnects during a delayed signer prompt', async () => {
    const originalSignEvent = KeyManager.signEvent.bind(KeyManager);
    let resumeSigning = () => {};
    const signing = new Promise<void>((resolve) => {
      resumeSigning = resolve;
    });
    const signEvent = vi.spyOn(KeyManager, 'signEvent').mockImplementation(async (event: Event) => {
      await signing;
      return originalSignEvent(event);
    });
    const client = new NostrClient(['wss://one.example', 'wss://two.example']);
    try {
      await client.connect();
      const publication = client.postLongFormContent(article());
      await vi.waitFor(() => expect(signEvent).toHaveBeenCalledOnce());
      setOpenDelay('wss://two.example/', 40);
      FakeWebSocket.instances[1].close();
      resumeSigning();

      await expect(publication).resolves.toMatchObject({
        publication: {
          acceptedRelays: ['wss://one.example', 'wss://two.example'],
          unavailableRelays: []
        }
      });
      expect(FakeWebSocket.instances[2].sent.some((message) => message.includes('"EVENT"'))).toBe(
        true
      );
    } finally {
      await client.close();
    }
  });

  it('includes slower initial connections opened after the first relay', async () => {
    setOpenDelay('wss://one.example/', 5);
    setOpenDelay('wss://two.example/', 40);
    setOpenDelay('wss://three.example/', 80);
    const client = new NostrClient([
      'wss://one.example',
      'wss://two.example',
      'wss://three.example'
    ]);
    try {
      const result = await client.postLongFormContent(article());
      expect(result.publication.acceptedRelays).toEqual([
        'wss://one.example',
        'wss://two.example',
        'wss://three.example'
      ]);
      expect(FakeWebSocket.instances).toHaveLength(3);
      expect(
        FakeWebSocket.instances.every((socket) =>
          socket.sent.some((message) => message.includes('"EVENT"'))
        )
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('publishes after the first relay recovers while another stays silent', async () => {
    const client = new NostrClient(['wss://one.example', 'wss://two.example'], 2500);
    try {
      await client.connect();
      setOpenDelay('wss://one.example/', 20);
      setRelayBehavior('wss://two.example/', 'hang');
      FakeWebSocket.instances[0].close();
      FakeWebSocket.instances[1].close();

      const startedAt = Date.now();
      const result = await client.postLongFormContent(article());
      expect(Date.now() - startedAt).toBeLessThan(2000);
      expect(result.publication.acceptedRelays).toEqual(['wss://one.example']);
      expect(result.publication.unavailableRelays).toEqual(['wss://two.example']);
    } finally {
      await client.close();
    }
  });

  it('shares one wait when two callers request a connecting relay', async () => {
    setRelayBehavior('wss://pending.example/', 'hang');
    const client = new NostrClient(['wss://pending.example'], 20);
    try {
      await client.connect();
      const first = client.ensureRelay('wss://pending.example', 1000);
      const second = client.ensureRelay('wss://pending.example', 1000);
      expect(first).toBe(second);
      await new Promise((resolve) => setTimeout(resolve, 5));
      FakeWebSocket.instances[0].open();
      await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
      expect(FakeWebSocket.instances).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  it('keeps the replacement socket available after the old socket closes again', async () => {
    const client = new NostrClient(['wss://relay.example'], 1000);
    try {
      await client.connect();
      const old = FakeWebSocket.instances[0];
      old.readyState = 2;
      const reconnect = client.ensureRelay('wss://relay.example', 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      old.close();
      await reconnect;
      expect(FakeWebSocket.instances).toHaveLength(2);
      old.onclose?.({ code: 1000, reason: '' });

      await expect(client.deleteArticle(article('e'.repeat(64)))).resolves.toMatchObject({
        acceptedRelays: ['wss://relay.example'],
        unavailableRelays: []
      });
      expect(FakeWebSocket.instances[1].sent.some((message) => message.includes('"EVENT"'))).toBe(
        true
      );
    } finally {
      await client.close();
    }
  });

  it('keeps the connection open after publishing, for the next publication', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const client = new NostrClient(['wss://relay.example'], 1000);
    try {
      const publication = client.postLongFormContent(article());
      await vi.advanceTimersByTimeAsync(100);
      await expect(publication).resolves.toBeDefined();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.OPEN);
    } finally {
      vi.useRealTimers();
      await client.close();
    }
  });

  it('waits 10 seconds for a relay to answer before taking it as one that did not', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    setRelayBehavior('wss://silent.example', 'silent');
    const client = new NostrClient(['wss://silent.example'], 1000);
    try {
      const publication = client.postLongFormContent(article());
      const settled = vi.fn();
      publication.then(settled, settled);
      await vi.advanceTimersByTimeAsync(9_900);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);

      await expect(publication).rejects.toMatchObject({
        result: { acceptedRelays: [], rejectedRelays: [], timedOutRelays: ['wss://silent.example'] }
      });
    } finally {
      vi.useRealTimers();
      await client.close();
    }
  });
});
