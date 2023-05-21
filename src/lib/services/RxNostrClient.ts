import { delay, flatMap, map, Observable } from 'rxjs';
import type { RxNostr, EventPacket } from 'rx-nostr';
import { RxBackwardReq, uniq, verify, createRxNostr } from 'rx-nostr';
import { Kind } from 'nostr-tools';
import Reaction from '$lib/entities/Reaction';

export default class RxNostrClient {
  private relays: string[];
  private rxNostr: RxNostr;

  constructor({ relays }: { relays: string[] }) {
    this.relays = relays;
    this.rxNostr = createRxNostr();
    this.rxNostr.setRelays(this.relays);
  }

  observableNote({ id, timeout = 500 }: { id: string; timeout?: number }): Observable<EventPacket> {
    const req = new RxBackwardReq();
    req.emit([{ kinds: [Kind.Text], ids: [id] }]);

    return this.rxNostr.use(req.pipe(delay(timeout))).pipe(uniq(), verify());
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

  observableReactions({
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
        kinds: [Kind.Reaction],
        authors: [pubkey],
        limit
      }
    ]);

    return this.rxNostr.use(req.pipe(delay(timeout))).pipe(uniq(), verify());
  }

  // TODO: change signature to Observable<[EventPacket, EventPacket]>
  observableReactedNotes({
    pubkey,
    limit = 100,
    timeout = 500
  }: {
    pubkey: string;
    limit?: number;
    timeout?: number;
  }): Observable<EventPacket[]> {
    return this.observableReactions({ pubkey, limit, timeout }).pipe(
      flatMap((reactionEnveolope) => {
        const reaction = Reaction.fromEvent(reactionEnveolope.event);
        return this.observableNote({ id: reaction.eventId() }).pipe(
          map((noteEnvelope) => {
            return [reactionEnveolope, noteEnvelope];
          })
        );
      })
    );
  }
}
