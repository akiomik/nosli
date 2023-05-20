import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { delay, map } from 'rxjs';
import { RxBackwardReq, uniq, verify, latest } from 'rx-nostr';
import type { RxNostr } from 'rx-nostr';
import { Kind } from 'nostr-tools';
import NostrClient from '$lib/services/NostrClient';
import LongFormContent from '$lib/entities/LongFormContent';
import Profile from '$lib/entities/Profile';

// TODO: Return Readable or Observable
export function globalMatomesStore({
  client,
  limit,
  delayTime = 500
}: {
  client: RxNostr;
  limit: number;
  delayTime?: number;
}): Writable<LongFormContent[] | undefined> {
  const store = writable<LongFormContent[] | undefined>(undefined);

  const req = new RxBackwardReq();
  req.emit([
    {
      kinds: [Kind.Article],
      '#t': [NostrClient.TAG],
      limit
    }
  ]);

  // TODO: make matomes unique by naddr
  client
    .use(req.pipe(delay(delayTime)))
    .pipe(
      uniq(),
      verify(),
      map((envelope) => LongFormContent.fromEvent(envelope.event))
    )
    .subscribe((matome) => {
      store.update((matomes) => {
        if (matomes === undefined) {
          return [matome];
        } else {
          return [...matomes, matome];
        }
      });
    });

  return store;
}

// TODO: Return Readable or Observable
export function userMatomesStore({
  client,
  pubkey,
  delayTime = 500
}: {
  client: RxNostr;
  pubkey: string;
  limit: number;
  delayTime?: number;
}): Writable<LongFormContent[] | undefined> {
  const store = writable<LongFormContent[] | undefined>(undefined);

  const req = new RxBackwardReq();
  req.emit([
    {
      kinds: [Kind.Article],
      authors: [pubkey],
      '#t': [NostrClient.TAG]
    }
  ]);

  // TODO: make matomes unique by naddr
  client
    .use(req.pipe(delay(delayTime)))
    .pipe(
      uniq(),
      verify(),
      map((envelope) => LongFormContent.fromEvent(envelope.event))
    )
    .subscribe((matome) => {
      store.update((matomes) => {
        if (matomes === undefined) {
          return [matome];
        } else {
          return [...matomes, matome];
        }
      });
    });

  return store;
}

// TODO: Return Readable or Observable
export function profileStore({
  client,
  pubkey,
  delayTime = 500
}: {
  client: RxNostr;
  pubkey: string;
  delayTime?: number;
}): Writable<Profile | undefined> {
  const store = writable<Profile | undefined>(undefined);

  const req = new RxBackwardReq();
  req.emit([
    {
      kinds: [Kind.Metadata],
      authors: [pubkey],
      limit: 1
    }
  ]);

  client
    .use(req.pipe(delay(delayTime)))
    .pipe(
      verify(),
      latest(),
      map((envelope) => Profile.fromEvent(envelope.event))
    )
    .subscribe((profile) => store.set(profile));

  return store;
}
