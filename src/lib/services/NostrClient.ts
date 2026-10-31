import {
  Kind,
  SimplePool,
  nip19,
  utils,
  validateEvent,
  verifySignature,
  type Relay
} from 'nostr-tools';

import LongFormContent from '$lib/entities/LongFormContent';
import KeyManager from '$lib/services/KeyManager';
import {
  PublicationFailedError,
  emptyPublicationResult,
  publishToRelays,
  type PublicationResult
} from '$lib/services/publishToRelays';

const PUBLICATION_CONNECTION_GRACE_MS = 1000;

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
  private relays = new Map<string, Relay>();
  private connectionAttempts = new Map<string, Promise<void>>();
  private connectionStatus: Promise<void>;
  private firstConnection: Promise<void>;
  private closed = false;

  // Increase connection timeout to avoid Blink issue (incl. Chrome, Edge)
  constructor(
    public urls: string[],
    private connectionTimeoutInMillis = 3000
  ) {
    const attempts = this.urls.map((url) => this.ensureRelay(url, this.connectionTimeoutInMillis));
    this.connectionStatus = Promise.allSettled(attempts).then(() => {});
    this.firstConnection = Promise.any(attempts).then(
      () => {},
      () => {}
    );
  }

  // NOTE: Temporarily increasing the timeout to avoid a bug in Blink :cry:
  public async connect(): Promise<void> {
    return this.connectionStatus;
  }

  private waitForRelay(
    relay: Relay,
    event: 'connect' | 'disconnect',
    timeoutInMillis: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeoutId);
        // nostr-tools iterates listener arrays; removing during a callback skips the next listener.
        queueMicrotask(() => relay.off(event, onReady));
        queueMicrotask(() => relay.off('error', onError));
      };
      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Failed to connect to ${relay.url}.`));
      };
      const timeoutId = setTimeout(onError, timeoutInMillis);
      relay.on('error', onError);
      relay.on(event, onReady);
    });
  }

  private async openRelay(url: string, timeoutInMillis: number): Promise<void> {
    const relay = await this.pool.ensureRelay(url);
    if (this.closed) {
      relay.close();
      throw new Error('The relay client is closed.');
    }

    this.relays.set(utils.normalizeURL(url), relay);
    if (relay.status === 0) await this.waitForRelay(relay, 'connect', timeoutInMillis);
    if (relay.status === 2) await this.waitForRelay(relay, 'disconnect', timeoutInMillis);
    if (relay.status === 3) await relay.connect();
    if (this.closed) {
      relay.close();
      throw new Error('The relay client is closed.');
    }
    if (relay.status !== 1) throw new Error(`Failed to connect to ${url}.`);
  }

  public ensureRelay(url: string, timeoutInMillis: number): Promise<void> {
    if (this.closed) return Promise.reject(new Error('The relay client is closed.'));
    const key = utils.normalizeURL(url);
    const existing = this.connectionAttempts.get(key);
    if (existing) return existing;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Timed out connecting to ${url}.`)),
        timeoutInMillis
      );
    });
    const attempt = Promise.race([this.openRelay(url, timeoutInMillis), timeout]).finally(() => {
      clearTimeout(timeoutId);
      if (this.connectionAttempts.get(key) === attempt) this.connectionAttempts.delete(key);
    });
    this.connectionAttempts.set(key, attempt);
    return attempt;
  }

  private availableUrls(): string[] {
    return this.urls.filter((url) => this.relays.get(utils.normalizeURL(url))?.status === 1);
  }

  private startMissingConnections(): Promise<void>[] {
    return this.urls
      .filter((url) => this.relays.get(utils.normalizeURL(url))?.status !== 1)
      .map((url) => this.ensureRelay(url, this.connectionTimeoutInMillis));
  }

  private async waitForRelayBeforeSigning(): Promise<void> {
    await this.firstConnection;
    if (this.closed) throw new Error('The relay client is closed.');
    if (this.availableUrls().length === 0) {
      await Promise.any(this.startMissingConnections()).catch(() => {});
    }
    if (this.closed) throw new Error('The relay client is closed.');
    if (this.availableUrls().length === 0) {
      throw new PublicationFailedError({
        ...emptyPublicationResult(),
        unavailableRelays: [...this.urls]
      });
    }
  }

  private async relaysAfterSigning(): Promise<{ available: string[]; unavailable: string[] }> {
    if (this.closed) throw new Error('The relay client is closed.');
    const attempts = this.startMissingConnections();
    if (this.availableUrls().length === 0) {
      // One recovered relay is enough to publish; do not wait for silent peers.
      await Promise.any(attempts).catch(() => {});
    } else if (attempts.length > 0) {
      // Allow shortly delayed initial connections and reconnects to join this publication.
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const gracePeriod = new Promise<void>((resolve) => {
        timeoutId = setTimeout(resolve, PUBLICATION_CONNECTION_GRACE_MS);
      });
      await Promise.race([Promise.allSettled(attempts), gracePeriod]);
      clearTimeout(timeoutId);
    }
    if (this.closed) throw new Error('The relay client is closed.');
    const available = this.availableUrls();
    if (available.length === 0) {
      throw new PublicationFailedError({
        ...emptyPublicationResult(),
        unavailableRelays: [...this.urls]
      });
    }
    return {
      available,
      unavailable: this.urls.filter((url) => !available.includes(url))
    };
  }

  public async postLongFormContent(
    lfc: LongFormContent
  ): Promise<{ content: LongFormContent; publication: PublicationResult }> {
    await this.waitForRelayBeforeSigning();
    const event = await KeyManager.signEvent(lfc.toEvent());
    if (!validateEvent(event) || !verifySignature(event)) {
      throw new Error('Unexpected error: event is invalid.');
    }

    const { available, unavailable } = await this.relaysAfterSigning();
    const publication = await publishToRelays(this.pool, available, event, undefined, unavailable);
    console.log('new LFC is published.', event);
    return { content: LongFormContent.fromEvent(event), publication };
  }

  public async deleteEvent(id: string): Promise<PublicationResult> {
    await this.waitForRelayBeforeSigning();
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

    const { available, unavailable } = await this.relaysAfterSigning();
    return publishToRelays(this.pool, available, event, undefined, unavailable);
  }

  public async close(): Promise<void> {
    this.closed = true;
    try {
      await this.pool.close(this.urls);
    } catch {
      // ignore errors
    }
  }
}
