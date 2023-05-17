import { delay, Observable } from 'rxjs';
import type { RxNostr, EventPacket } from 'rx-nostr';
import { RxBackwardReq, uniq, verify, latest, createRxNostr } from 'rx-nostr';
import { Kind } from 'nostr-tools';
import NostrClient from '$lib/services/NostrClient';

export default class RxNostrClient {
  private relays: string[];
  private rxNostr: RxNostr;

  constructor({ relays }: { relays: string[] }) {
    this.relays = relays;
    this.rxNostr = createRxNostr();
    this.rxNostr.setRelays(this.relays);
  }

  observableNotes({
    ids,
    timeout = 500
  }: {
    ids: string[];
    timeout?: number;
  }): Observable<EventPacket> {
    const req = new RxBackwardReq();
    req.emit([{ kinds: [Kind.Text], ids }]);

    return this.rxNostr.use(req.pipe(delay(timeout))).pipe(uniq(), verify());
  }

  observableProfile({
    pubkey,
    timeout = 500
  }: {
    pubkey: string;
    timeout?: number;
  }): Observable<EventPacket> {
    const req = new RxBackwardReq();
    req.emit([
      {
        kinds: [Kind.Metadata],
        authors: [pubkey],
        limit: 1
      }
    ]);

    return this.rxNostr.use(req.pipe(delay(timeout))).pipe(verify(), latest());
  }

  observableUserMatomes({
    pubkey,
    limit = 100,
    timeout = 500
  }: {
    pubkey: string;
    limit?: number;
    timeout?: number;
  }): Observable<EventPacket> {
    const req = new RxBackwardReq();
    req.emit([
      {
        kinds: [Kind.Article],
        authors: [pubkey],
        '#t': [NostrClient.TAG],
        limit
      }
    ]);

    // FIXME: To avoid duplication, make this unique by pubkey and indentifier
    return this.rxNostr.use(req.pipe(delay(timeout))).pipe(uniq(), verify());
  }

  observableGlobalMatomes({
    limit,
    timeout = 500
  }: {
    limit: number;
    timeout?: number;
  }): Observable<EventPacket> {
    const req = new RxBackwardReq();
    req.emit([
      {
        kinds: [Kind.Article],
        '#t': [NostrClient.TAG],
        limit
      }
    ]);

    return this.rxNostr.use(req.pipe(delay(timeout))).pipe(uniq(), verify());
  }

  observableMatome({
    pubkey,
    identifier,
    timeout = 500
  }: {
    pubkey: string;
    identifier: string;
    timeout?: number;
  }): Observable<EventPacket> {
    const req = new RxBackwardReq();
    req.emit([
      {
        kinds: [Kind.Article],
        authors: [pubkey],
        '#d': [identifier],
        '#t': [NostrClient.TAG],
        limit: 1
      }
    ]);

    return this.rxNostr.use(req.pipe(delay(timeout))).pipe(verify(), latest());
  }
}
