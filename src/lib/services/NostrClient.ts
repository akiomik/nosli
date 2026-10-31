import { Kind, SimplePool, nip19, validateEvent, verifySignature } from 'nostr-tools';

import LongFormContent from '$lib/entities/LongFormContent';
import KeyManager from '$lib/services/KeyManager';
import {
  PublicationFailedError,
  publishToRelays,
  type PublicationResult
} from '$lib/services/publishToRelays';

export const nip19ToHex = (b32: string): string => {
  const data = nip19.decode(b32);
  if (data.type === 'note' && typeof data.data === 'string') return data.data;
  if (data.type === 'nevent' && typeof data.data !== 'string' && 'id' in data.data) {
    return data.data.id;
  }
  throw new Error('Expected a note or nevent identifier.');
};

export default class NostrClient {
  static TAG = 'nosli';

  private pool = new SimplePool();
  private availableUrls: string[] = [];
  private connectionStatus: Promise<void>;

  // Increase connection timeout to avoid Blink issue (incl. Chrome, Edge)
  constructor(public urls: string[], connectionTimeoutInMillis = 3000) {
    const promises = this.urls.map((url) => {
      return this.ensureRelay(url, connectionTimeoutInMillis).catch(() => {
        // ignore connection and timeout errors
      });
    });

    this.connectionStatus = Promise.all(promises).then(() => {
      return;
    });
  }

  // NOTE: Temporarily increasing the timeout to avoid a bug in Blink :cry:
  public async connect(): Promise<void> {
    return this.connectionStatus;
  }

  public async ensureRelay(url: string, timeoutInMillis: number): Promise<void> {
    const promise = this.pool.ensureRelay(url).then((relay) => {
      console.log(`connected to ${relay.url}`);
      this.availableUrls.push(relay.url);
      relay.on('disconnect', () => {
        this.availableUrls = this.availableUrls.filter(
          (availableUrl) => availableUrl !== relay.url
        );
      });
    });

    // support both node and browser types (https://stackoverflow.com/a/56239226/1918609)
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise((_resolve, reject) => {
      timeoutId = setTimeout(() => reject(), timeoutInMillis);
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    return Promise.race([promise, timeout]).then(() => {
      return;
    });
  }

  private async publishRelays(): Promise<string[]> {
    await this.connect();
    if (this.availableUrls.length === 0) {
      throw new PublicationFailedError({
        acceptedRelays: [],
        rejectedRelays: [],
        timedOutRelays: []
      });
    }
    return [...this.availableUrls];
  }

  public async postLongFormContent(
    lfc: LongFormContent
  ): Promise<{ content: LongFormContent; publication: PublicationResult }> {
    const relays = await this.publishRelays();
    const event = await KeyManager.signEvent(lfc.toEvent());
    if (!validateEvent(event) || !verifySignature(event)) {
      throw new Error('Unexpected error: event is invalid.');
    }

    const publication = await publishToRelays(this.pool, relays, event);
    console.log('new LFC is published.', event);
    return { content: LongFormContent.fromEvent(event), publication };
  }

  public async deleteEvent(id: string): Promise<PublicationResult> {
    const relays = await this.publishRelays();
    let event = {
      id: '',
      sig: '',
      kind: Kind.EventDeletion,
      content: 'Deleted',
      pubkey: '',
      created_at: Math.round(new Date().getTime() / 1000),
      tags: [['e', id]]
    };
    event = await KeyManager.signEvent(event);

    if (!validateEvent(event) || !verifySignature(event)) {
      throw new Error('Unexpected error: event is invalid.');
    }

    return publishToRelays(this.pool, relays, event);
  }

  public async close(): Promise<void> {
    try {
      await this.pool.close(this.availableUrls);
      this.availableUrls = [];
    } catch {
      // ignore errors
    }
  }
}
