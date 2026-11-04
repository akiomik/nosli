import {
  kinds,
  SimplePool,
  nip19,
  utils,
  validateEvent,
  verifyEvent,
  type Event
} from 'nostr-tools';
import type { AbstractRelay } from 'nostr-tools/abstract-relay';

import { isEventId } from '#lib/entities/EventId.js';
import LongFormContent from '#lib/entities/LongFormContent.js';
import { toSeconds } from '#lib/helper.js';
import KeyManager, { Nip07CanceledError } from '#lib/services/KeyManager.js';
import { relayHints } from '#lib/services/relayHints.js';
import {
  ACK_TIMEOUT_MS,
  PublicationFailedError,
  SignedByAnotherAccountError,
  emptyPublicationResult,
  publishToRelays,
  type PublicationResult
} from '#lib/services/publishToRelays.js';

const PUBLICATION_CONNECTION_GRACE_MS = 1000;

// How a publication tells the form about signing, so that the user can stop waiting for it.
export type SigningOptions = {
  // Aborted when the user stops waiting. Nothing is then sent, even if the signature comes later.
  signal?: AbortSignal;
  // Called with true when the event goes to the signer, and with false once it comes back.
  onSigning?: (signing: boolean) => void;
};

// Returns the event ID of a note or nevent, and the relays that an nevent hints at.
export const decodeNoteId = (b32: string): { id: string; relays: string[] } => {
  const data = nip19.decode(b32);
  let id: string | undefined;
  let relays: string[] = [];
  if (data.type === 'note' && typeof data.data === 'string') id = data.data;
  if (data.type === 'nevent' && typeof data.data !== 'string' && 'id' in data.data) {
    id = data.data.id;
    relays = relayHints(data.data.relays ?? []);
  }
  // A note decodes to however many bytes it holds, so check that it is a 32-byte event ID.
  if (id === undefined || !isEventId(id)) {
    throw new Error('Expected a note or nevent identifier.');
  }
  return { id, relays };
};

export default class NostrClient {
  static TAG = 'nosli';

  private pool = NostrClient.newPool();
  private relays = new Map<string, AbstractRelay>();
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

  // nostr-tools closes a relay after 20 seconds without a request, but a list is published long after
  // its form opens, so connections stay open until the client closes.
  private static newPool(): SimplePool {
    const pool = new SimplePool();
    pool.idleTimeout = 0;
    return pool;
  }

  // ensureRelay gets no timeout, so that a relay that is slow to connect keeps connecting after the
  // wait for it ends, and a later publication can use it.
  private async openRelay(url: string): Promise<void> {
    const relay = await this.pool.ensureRelay(url);
    if (this.closed) {
      relay.close();
      throw new Error('The relay client is closed.');
    }

    // nostr-tools gives up on an answer sooner than publishToRelays does, which decides instead.
    relay.publishTimeout = ACK_TIMEOUT_MS * 2;
    this.relays.set(utils.normalizeURL(url), relay);
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
    const attempt = Promise.race([this.openRelay(url), timeout]).finally(() => {
      clearTimeout(timeoutId);
      if (this.connectionAttempts.get(key) === attempt) this.connectionAttempts.delete(key);
    });
    this.connectionAttempts.set(key, attempt);
    return attempt;
  }

  // Publishes through the relays that openRelay opened, which wait for an answer as long as
  // publishToRelays does. The pool would open a relay that has closed again, which waits less.
  private opened = {
    publish: (urls: string[], event: Event): Promise<string>[] =>
      urls.map((url) => {
        const relay = this.relays.get(utils.normalizeURL(url));
        return relay ? relay.publish(event) : Promise.reject(`${url} is not open`);
      })
  };

  private availableUrls(): string[] {
    return this.urls.filter((url) => this.relays.get(utils.normalizeURL(url))?.connected);
  }

  private startMissingConnections(): Promise<void>[] {
    return this.urls
      .filter((url) => !this.relays.get(utils.normalizeURL(url))?.connected)
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

  private async sign(event: Event, { signal, onSigning }: SigningOptions = {}): Promise<Event> {
    onSigning?.(true);
    try {
      const signed = await KeyManager.signEvent(event, signal);
      // A signer that answers at once, such as a secret key, does not look at the signal.
      if (signal?.aborted) throw new Nip07CanceledError();
      return signed;
    } finally {
      onSigning?.(false);
    }
  }

  // For an update, `author` is the author of the list, the only account that can sign it. The event
  // to sign has no pubkey, since some NIP-07 extensions keep a pubkey they are given, and others
  // refuse one that is not theirs.
  public async postLongFormContent(
    lfc: LongFormContent,
    author?: string,
    signing?: SigningOptions
  ): Promise<{ content: LongFormContent; publication: PublicationResult }> {
    await this.waitForRelayBeforeSigning();
    const event = await this.sign({ ...lfc.toEvent(), pubkey: '' }, signing);
    if (!validateEvent(event) || !verifyEvent(event)) {
      throw new Error('Unexpected error: event is invalid.');
    }
    if (author !== undefined && event.pubkey !== author) throw new SignedByAnotherAccountError();

    const { available, unavailable } = await this.relaysAfterSigning();
    const publication = await publishToRelays(
      this.opened,
      available,
      event,
      undefined,
      unavailable
    );
    console.log('new LFC is published.', event);
    return { content: LongFormContent.fromEvent(event), publication };
  }

  // The a tag also deletes the earlier versions that relays still hold, which the e tag misses.
  // NIP-09 has relays delete the versions up to and including the created_at of the request, so
  // the request is dated no earlier than the article, which can be from a clock that is ahead.
  public async deleteArticle(
    article: LongFormContent,
    signing?: SigningOptions
  ): Promise<PublicationResult> {
    const id = article.id;
    if (!id) throw new Error('Unexpected error: the article is not published.');

    await this.waitForRelayBeforeSigning();
    let event = {
      id: '',
      sig: '',
      kind: kinds.EventDeletion,
      content: 'Deleted',
      pubkey: '',
      created_at: Math.max(toSeconds(new Date()), toSeconds(article.createdAt)),
      tags: [
        ['e', id],
        ['a', article.address()],
        ['k', kinds.LongFormArticle.toString()]
      ]
    };
    event = await this.sign(event, signing);

    if (!validateEvent(event) || !verifyEvent(event)) {
      throw new Error('Unexpected error: event is invalid.');
    }
    if (event.pubkey !== article.pubkey) throw new SignedByAnotherAccountError();

    const { available, unavailable } = await this.relaysAfterSigning();
    return publishToRelays(this.opened, available, event, undefined, unavailable);
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
