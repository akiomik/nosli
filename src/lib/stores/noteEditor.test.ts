import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY, concatMap, delay, first, from, map, mergeMap, of } from 'rxjs';
import { get } from 'svelte/store';
import {
  finishEvent,
  getPublicKey,
  Kind,
  matchFilters,
  type Event,
  type Filter
} from 'nostr-tools';
import type { RxNostr, RxReq } from 'rx-nostr';

import type { LoadingNote } from '$lib/entities/LoadingNote';
import KeyManager from '$lib/services/KeyManager';
import { createNoteEditorStore } from './noteEditor';

vi.mock('$lib/stores/cookie', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(true), pubkey: writable(''), seckey: writable('') };
});

const key = '1'.repeat(64);
const user = getPublicKey(key);
const note = (content: string) =>
  finishEvent({ kind: Kind.Text, content, created_at: 1, tags: [] }, key);
const reaction = (target: Event, createdAt: number) =>
  finishEvent(
    { kind: Kind.Reaction, content: '+', created_at: createdAt, tags: [['e', target.id]] },
    key
  );

// Serves the events that match each request once, like a relay that answers and sends EOSE. With
// `interval`, the events arrive that many milliseconds apart.
const fakeClient = (events: Event[], interval = 0) =>
  ({
    use: (req: RxReq) =>
      req.getReqObservable().pipe(
        first((filters) => filters !== null),
        mergeMap((filters) =>
          from(events.filter((event) => matchFilters(filters as Filter[], event)))
        ),
        concatMap((event) => (interval > 0 ? of(event).pipe(delay(interval)) : of(event))),
        map((event) => ({ from: 'wss://relay.example.com', subId: 'sub', event }))
      )
  }) as unknown as RxNostr;

// A client whose relays have nothing, so every request completes empty.
const emptyClient = { use: () => EMPTY } as unknown as RxNostr;

const lookupError = new Error('Failed to resolve NIP-07');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createNoteEditorStore', () => {
  it('ends loading recent reactions when the public key cannot be looked up', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(KeyManager, 'getPublicKey').mockRejectedValue(lookupError);

    const editor = createNoteEditorStore({ client: emptyClient });

    await vi.waitFor(() => expect(get(editor).searchInitialized).toBe(true));
    expect(get(editor)).toMatchObject({ searchFailed: true, searchRetrying: false });
  });

  it('keeps the failure message while a retry runs, and ignores another retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectRetry: (error: Error) => void = () => {};
    const getPublicKey = vi
      .spyOn(KeyManager, 'getPublicKey')
      .mockRejectedValueOnce(lookupError)
      .mockReturnValueOnce(new Promise((_, reject) => (rejectRetry = reject)));
    const editor = createNoteEditorStore({ client: emptyClient });
    await vi.waitFor(() => expect(get(editor).searchFailed).toBe(true));

    editor.retrySearch();
    editor.retrySearch();

    expect(get(editor)).toMatchObject({
      searchInitialized: true,
      searchFailed: true,
      searchRetrying: true
    });
    expect(getPublicKey).toHaveBeenCalledTimes(2);

    rejectRetry(lookupError);

    await vi.waitFor(() => expect(get(editor).searchRetrying).toBe(false));
    expect(get(editor)).toMatchObject({ searchInitialized: true, searchFailed: true });
  });

  it('shows recent reactions once when a retry finds the public key', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(KeyManager, 'getPublicKey').mockRejectedValueOnce(lookupError).mockResolvedValue(user);
    const older = note('older');
    const newer = note('newer');
    const events = [older, newer, reaction(older, 2), reaction(newer, 3)];
    const editor = createNoteEditorStore({ client: fakeClient(events, 20) });
    await vi.waitFor(() => expect(get(editor).searchFailed).toBe(true));
    const shownWhileRetrying: LoadingNote[][] = [];
    const unsubscribe = editor.subscribe(({ searchRetrying, searchedNotes }) => {
      if (searchRetrying) shownWhileRetrying.push(searchedNotes);
    });

    editor.retrySearch();

    await vi.waitFor(() => expect(get(editor).searchRetrying).toBe(false));
    unsubscribe();
    // The notes arrive one by one, but none shows under the failure message.
    expect(shownWhileRetrying.length).toBeGreaterThan(0);
    expect(shownWhileRetrying.every((notes) => notes.length === 0)).toBe(true);
    expect(get(editor).searchFailed).toBe(false);
    expect(get(editor).searchedNotes.map(({ note }) => note?.content)).toEqual(['newer', 'older']);
  });
});
