import {
  BehaviorSubject,
  EMPTY,
  concat,
  defer,
  finalize,
  map,
  of,
  startWith,
  switchMap,
  tap
} from 'rxjs';
import type { Observable, OperatorFunction } from 'rxjs';
import type { RxNostr } from 'rx-nostr';

import { reconnectFailedRelays } from '#lib/stores/client.js';

// Why a request ended without what it asked for: no relay answered it, or those that did had
// nothing.
export type Missing = 'unreachable' | 'not-found';

// Whether a relay sends anything while a request runs. A relay can be connected and still not answer,
// so the relays' state cannot tell.
const watchAnswers = (client: RxNostr) => {
  let answered = false;
  const subscription = client.createAllMessageObservable().subscribe(() => (answered = true));
  return {
    reason: (): Missing => (answered ? 'not-found' : 'unreachable'),
    stop: () => subscription.unsubscribe()
  };
};

// Ends with the reason, once the request ends without a value.
export function orMissing<T>(client: RxNostr): OperatorFunction<T, T | Missing> {
  return (source) =>
    defer(() => {
      let found = false;
      const answers = watchAnswers(client);
      return concat(
        source.pipe(tap(() => (found = true))),
        defer(() => (found ? EMPTY : of(answers.reason())))
      ).pipe(finalize(answers.stop));
    });
}

// What a request has returned so far. Once it has ended, also why anything is missing from it.
export type Progress<T> = { value: T; ended: false } | { value: T; ended: true; reason: Missing };

// Each value as not ended, and the last one again as ended once the request ends.
export function withEnd<T>(client: RxNostr): OperatorFunction<T, Progress<T>> {
  return (source) =>
    defer(() => {
      let last: { value: T } | undefined;
      const answers = watchAnswers(client);
      return concat(
        source.pipe(
          tap((value) => (last = { value })),
          map((value): Progress<T> => ({ value, ended: false }))
        ),
        defer(() =>
          last
            ? of<Progress<T>>({ value: last.value, ended: true, reason: answers.reason() })
            : EMPTY
        )
      ).pipe(finalize(answers.stop));
    });
}

export type Retries = {
  retry: () => void;
  // The request, made again for each retry. Its values stay until the next request gives its own.
  again: <T>(request: () => Observable<T>) => Observable<T>;
};

// Retries that make several requests again, as those of one page, which a failure to reach the
// relays has left empty too. Each retry first connects again to the relays that failed, as every
// request does, so that it does so whatever the requests are.
export function retries(client: RxNostr): Retries {
  const attempts = new BehaviorSubject<void>(undefined);
  return {
    retry: () => {
      reconnectFailedRelays(client);
      attempts.next();
    },
    again: (request) => attempts.pipe(switchMap(request))
  };
}

// A request that can be made again, as after it ended without an answer, alone or with the other
// requests of `retries`. It starts with undefined, and again for each retry, so that the page shows
// that it is loading.
export function retryable<T>(
  request: () => Observable<T>,
  { retry, again }: Retries
): Observable<T | undefined> & { retry: () => void } {
  return Object.assign(
    again(() => request().pipe(startWith(undefined))),
    { retry }
  );
}
