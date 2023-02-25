import type { Filter, Event, Pub } from 'nostr-tools';
import { SimplePool, getEventHash, signEvent, validateEvent, verifySignature } from 'nostr-tools';

import Note from '$lib/entities/Note';
import Profile from '$lib/entities/Profile';

export default class NostrClient {
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
    const promise = this.pool.ensureRelay(url).then(({ url }: { url: string }) => {
      console.log(`connected to ${url}`);
      this.availableUrls.push(url);
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

  public async getNote(id: string): Promise<Note | undefined> {
    const filters = [{ ids: [id] }];
    const event = await this.get(filters);
    if (event === null || event === undefined) {
      return undefined;
    }

    return Note.fromEvent(event);
  }

  public async getProfile(pubkey: string): Promise<Profile | undefined> {
    const filters = [{ authors: [pubkey], kinds: [0] }];
    const events = await this.list(filters);

    // Selecting the most recent kind0
    return events.reduce((acc: Profile | undefined, event: Event) => {
      const profile = Profile.fromEvent(event);
      if (acc === undefined || acc.createdAt < profile.createdAt) {
        return profile;
      }

      return acc;
    }, undefined);
  }

  public async get(filters: Filter[]): Promise<Event | undefined> {
    // NOTE: this.pool.get does not works...
    // return await this.pool.get(this.availableUrls, filters);
    const events = await this.list(filters);
    return events[0];
  }

  public async list(filters: Filter[]): Promise<Event[]> {
    return this.pool.list(this.availableUrls, filters);
  }

  public async postNote(note: Note, seckey: string): Promise<void> {
    const event = {
      id: '',
      sig: '',
      kind: 1,
      content: note.content,
      pubkey: note.pubkey,
      created_at: Math.round(note.createdAt.getTime() / 1000),
      tags: [] // TODO
    };
    event.id = getEventHash(event);
    event.sig = signEvent(event, seckey);

    if (!validateEvent(event) || !verifySignature(event)) {
      throw new Error('Unexpected error: event is invalid.');
    }

    const pubs = this.pool.publish(this.availableUrls, event);
    const promises = pubs.map((pub: Pub) => {
      return new Promise((resolve, reject) => {
        pub.on('ok', () => {
          resolve(null);
        });

        pub.on('failed', () => {
          reject();
        });
      });
    });

    return Promise.all(promises).then(() => {
      return;
    });
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
