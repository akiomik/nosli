import * as secp256k1 from '@noble/secp256k1';
import { bech32 } from '@scure/base';
import type { Pub } from 'nostr-tools';
import { Kind, SimplePool, validateEvent, verifySignature } from 'nostr-tools';
import type { AddressPointer, EventPointer, ProfilePointer } from 'nostr-tools/nip19';

import LongFormContent from '$lib/entities/LongFormContent';
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
