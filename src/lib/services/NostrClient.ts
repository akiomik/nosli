import * as secp256k1 from '@noble/secp256k1';
import { bech32 } from '@scure/base';
import type { Event, Filter, Pub } from 'nostr-tools';
import { Kind, nip19, SimplePool, validateEvent, verifySignature } from 'nostr-tools';
import type { AddressPointer, EventPointer, ProfilePointer } from 'nostr-tools/nip19';

import LongFormContent from '$lib/entities/LongFormContent';
import Note from '$lib/entities/Note';
import Profile from '$lib/entities/Profile';
import Tag from '$lib/entities/Tag';
import KeyManager from '$lib/services/KeyManager';

export const note1ToHex = (note1: string) =>
  secp256k1.utils.bytesToHex(new Uint8Array(bech32.fromWords(bech32.decode(note1, 5000).words)));

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

  // TODO: support note-style id
  public async getNote(id: string): Promise<Note | undefined> {
    const filters = [{ kinds: [Kind.Text], ids: [id] }];
    const event = await this.get(filters);
    if (event === null || event === undefined) {
      return undefined;
    }

    return Note.fromEvent(event);
  }

  public async listNotes(ids: string[]): Promise<Note[]> {
    const filters = [{ kinds: [Kind.Text], ids: ids }];

    const events = await this.list(filters);
    return events.reduce((acc: Note[], event: Event) => {
      if (event !== null && event !== undefined) {
        const note = Note.fromEvent(event);
        acc.push(note);
      }

      return acc;
    }, []);
  }

  public async listLikedPost(
    pubkey: string,
    options?: { includesMe?: boolean; limit?: number }
  ): Promise<Note[]> {
    const { includesMe = false, limit = 100 } = options ?? {};
    const likedEvents = await this.list([{ kinds: [Kind.Reaction], authors: [pubkey], limit }]);
    const likedNoteIds = likedEvents.flatMap((ev) =>
      ev.tags.flatMap(([tag, id]) => (tag === 'e' ? [id] : []))
    );

    const filters: Filter[] = [{ kinds: [Kind.Text], ids: likedNoteIds, limit }];
    if (includesMe) {
      filters.push({ kinds: [Kind.Text], authors: [pubkey] });
    }

    const noteEvents = await this.list(filters);
    noteEvents.sort((a, b) => b.created_at - a.created_at);
    return noteEvents.slice(0, limit).map(Note.fromEvent);
  }

  public async getProfile(pubkey: string): Promise<Profile | undefined> {
    const filters = [{ authors: [pubkey], kinds: [Kind.Metadata] }];
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
    return events.find((event: Event | undefined) => event !== undefined);
  }

  public async list(filters: Filter[]): Promise<Event[]> {
    return this.pool.list(this.availableUrls, filters);
  }

  public async postNote(note: Note): Promise<Note> {
    let event = {
      id: '',
      sig: '',
      kind: Kind.Text,
      content: note.content,
      pubkey: '',
      created_at: Math.round(note.createdAt.getTime() / 1000),
      tags: note.tags.map((tag) => [tag.typ, tag.value])
    };
    event = await KeyManager.signEvent(event);

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
      console.log('new note is published.', event);
      return Note.fromEvent(event);
    });
  }

  public async postLongFormContent(lfc: LongFormContent): Promise<LongFormContent> {
    const event = await KeyManager.signEvent(lfc.toEvent());
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
      console.log('new LFC is published.', event);
      return LongFormContent.fromEvent(event);
    });
  }

  public static checkNAddr(
    data: string | AddressPointer | ProfilePointer | EventPointer
  ): data is AddressPointer {
    if (typeof data === 'string') {
      return false;
    }

    return 'kind' in data && 'pubkey' in data && 'identifier' in data;
  }

  public async getLongFormContent(naddr: string): Promise<LongFormContent | undefined> {
    const { data } = nip19.decode(naddr);
    if (!NostrClient.checkNAddr(data)) {
      throw new Error(`Invalid naddr: ${naddr}`);
    }

    const { kind, pubkey, identifier } = data;
    const filter = {
      kinds: [kind],
      authors: [pubkey],
      '#d': [identifier]
    };
    const event = await this.get([filter]);
    if (event === undefined) {
      return undefined;
    }

    return LongFormContent.fromEvent(event);
  }

  public async getMatome(naddr: string) {
    const { data } = nip19.decode(naddr);
    if (!NostrClient.checkNAddr(data)) {
      throw new Error(`Invalid naddr: ${naddr}`);
    }

    const { kind, pubkey, identifier } = data;
    const filter = {
      kinds: [kind],
      authors: [pubkey],
      '#d': [identifier]
      // '#t': [NostrClient.TAG] // this does not seems to work with snort
    };
    const event = await this.get([filter]);
    if (event === undefined) {
      return undefined;
    }

    const lfc = LongFormContent.fromEvent(event);
    if (!lfc.includesTag(new Tag('t', NostrClient.TAG))) {
      return undefined;
    }

    return lfc;
  }

  public async listGlobalMatomes(limit: number): Promise<LongFormContent[]> {
    const filter = {
      kinds: [Kind.Article],
      limit: limit,
      '#t': [NostrClient.TAG]
    };
    const events = await this.list([filter]);

    return events.map((event: Event) => LongFormContent.fromEvent(event));
  }

  public async listMatomes(pubkey: string): Promise<LongFormContent[]> {
    const filter = {
      kinds: [Kind.Article],
      authors: [pubkey],
      '#t': [NostrClient.TAG]
    };
    const events = await this.list([filter]);

    return events.map((event: Event) => LongFormContent.fromEvent(event));
  }

  public async deleteEvent(id: string): Promise<void> {
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
