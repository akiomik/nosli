import { Kind, SimplePool, nip19, validateEvent, verifySignature, type Relay } from 'nostr-tools';

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
  private trackedRelays = new Set<string>();
  private closed = false;

  // Increase connection timeout to avoid Blink issue (incl. Chrome, Edge)
  constructor(public urls: string[], private connectionTimeoutInMillis = 3000) {
    const promises = this.urls.map((url) => {
      return this.ensureRelay(url, this.connectionTimeoutInMillis).catch(() => {
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

  private waitForConnectingRelay(relay: Relay, timeoutInMillis: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutId);
        relay.off('connect', onConnect);
        relay.off('error', onError);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed to connect to ${relay.url}.`));
      };
      const timeoutId = setTimeout(onError, timeoutInMillis);
      relay.on('error', onError);
      relay.on('connect', onConnect);
    });
  }

  public async ensureRelay(url: string, timeoutInMillis: number): Promise<void> {
    if (this.closed) return;
    const promise = this.pool.ensureRelay(url).then(async (relay) => {
      if (this.closed) {
        await relay.close();
        return;
      }

      if (!this.trackedRelays.has(relay.url)) {
        this.trackedRelays.add(relay.url);
        relay.on('connect', () => {
          if (this.closed) {
            void Promise.resolve(relay.close()).catch(() => {});
          } else if (!this.availableUrls.includes(relay.url)) {
            this.availableUrls.push(relay.url);
          }
        });
        relay.on('disconnect', () => {
          this.availableUrls = this.availableUrls.filter(
            (availableUrl) => availableUrl !== relay.url
          );
        });
      }

      // SimplePool caches failed and disconnected Relay objects without reconnecting them.
      if (relay.status === 0) await this.waitForConnectingRelay(relay, timeoutInMillis);
      if (relay.status > 1) await relay.connect();
      if (this.closed) {
        await relay.close();
      } else if (relay.status === 1 && !this.availableUrls.includes(relay.url)) {
        console.log(`connected to ${relay.url}`);
        this.availableUrls.push(relay.url);
      }
    });

    // support both node and browser types (https://stackoverflow.com/a/56239226/1918609)
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise((_resolve, reject) => {
      timeoutId = setTimeout(() => reject(), timeoutInMillis);
    });

    return Promise.race([promise, timeout])
      .then(() => {
        return;
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
  }

  private async requireAvailableRelays(retryUnavailable = true): Promise<string[]> {
    await this.connect();
    if (this.closed) throw new Error('The relay client is closed.');
    if (retryUnavailable || this.availableUrls.length === 0) {
      await Promise.allSettled(
        this.urls
          .filter((url) => !this.availableUrls.includes(url))
          .map((url) => this.ensureRelay(url, this.connectionTimeoutInMillis))
      );
    }
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
    await this.requireAvailableRelays();
    const event = await KeyManager.signEvent(lfc.toEvent());
    if (!validateEvent(event) || !verifySignature(event)) {
      throw new Error('Unexpected error: event is invalid.');
    }

    const publication = await publishToRelays(
      this.pool,
      await this.requireAvailableRelays(false),
      event
    );
    console.log('new LFC is published.', event);
    return { content: LongFormContent.fromEvent(event), publication };
  }

  public async deleteEvent(id: string): Promise<PublicationResult> {
    await this.requireAvailableRelays();
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

    return publishToRelays(this.pool, await this.requireAvailableRelays(false), event);
  }

  public async close(): Promise<void> {
    this.closed = true;
    this.availableUrls = [];
    try {
      await this.pool.close(this.urls);
    } catch {
      // ignore errors
    }
  }
}
