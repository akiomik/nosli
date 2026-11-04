import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY,
  Subject,
  concatMap,
  delay,
  first,
  from,
  ignoreElements,
  map,
  mergeMap,
  of,
  timer
} from 'rxjs';
import { get } from 'svelte/store';
import {
  finishEvent,
  getPublicKey,
  Kind,
  matchFilters,
  nip19,
  type Event,
  type Filter
} from 'nostr-tools';
import type { RxNostr, RxReq } from 'rx-nostr';

import type { LoadingNote } from '$lib/entities/LoadingNote';
import LongFormContent from '$lib/entities/LongFormContent';
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

// A client whose relays have nothing and send EOSE after `ms` milliseconds.
const slowEmptyClient = (ms: number) =>
  ({ use: () => timer(ms).pipe(ignoreElements()) }) as unknown as RxNostr;

const listOf = (noteIds: string[]) =>
  LongFormContent.compose({ identifier: 'list', title: 'List', summary: '', noteIds });

const contents = (notes: LoadingNote[]) => notes.map(({ note }) => note?.content);

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

describe('createNoteEditorStore notes', () => {
  beforeEach(() => {
    vi.spyOn(KeyManager, 'getPublicKey').mockResolvedValue(user);
  });

  it('keeps the notes of a list that no relay returns', async () => {
    const kept = note('kept');
    const missing = 'f'.repeat(64);
    const editor = createNoteEditorStore({
      matome: listOf([missing, kept.id]),
      client: fakeClient([kept])
    });

    await vi.waitFor(() => expect(get(editor).editorInitialized).toBe(true));
    expect(get(editor).notes.map(({ id }) => id)).toEqual([missing, kept.id]);
    expect(contents(get(editor).notes)).toEqual([undefined, 'kept']);
  });

  it('keeps the notes of a list when no relay returns any of them', async () => {
    const ids = ['e'.repeat(64), 'f'.repeat(64)];
    const editor = createNoteEditorStore({ matome: listOf(ids), client: emptyClient });

    await vi.waitFor(() => expect(get(editor).editorInitialized).toBe(true));
    expect(get(editor).notes).toEqual(ids.map((id) => ({ id, note: undefined })));
  });

  it('lists a note that a list holds twice once', async () => {
    const first = note('first');
    const second = note('second');
    const editor = createNoteEditorStore({
      matome: listOf([first.id, second.id, first.id]),
      client: fakeClient([first, second])
    });

    await vi.waitFor(() => expect(get(editor).editorInitialized).toBe(true));
    expect(contents(get(editor).notes)).toEqual(['first', 'second']);
  });

  it('keeps a note added from recent reactions while the list is loading', async () => {
    const listed = note('listed');
    const added = note('added');
    const listLoad = new Subject<Event>();
    const client = {
      use: (req: RxReq) =>
        req.getReqObservable().pipe(
          first((filters) => filters !== null),
          mergeMap((filters) => {
            const ids = (filters as Filter[])[0].ids ?? [];
            return ids.includes(listed.id) ? listLoad : from(ids.includes(added.id) ? [added] : []);
          }),
          map((event) => ({ from: 'wss://relay.example.com', subId: 'sub', event }))
        )
    } as unknown as RxNostr;
    const editor = createNoteEditorStore({ matome: listOf([listed.id]), client });

    editor.appendNote(added.id);
    listLoad.next(listed);
    listLoad.complete();

    expect(contents(get(editor).notes)).toEqual(['listed', 'added']);
  });

  it('adds a note that no relay returns as not found once its request ends', async () => {
    const missing = 'f'.repeat(64);
    const editor = createNoteEditorStore({ client: slowEmptyClient(20) });

    editor.appendNote(nip19.noteEncode(missing));

    expect(get(editor)).toMatchObject({ notes: [], adding: [missing] });
    await vi.waitFor(() => expect(get(editor).adding).toEqual([]));
    expect(get(editor).notes).toEqual([{ id: missing, note: undefined }]);
  });

  it('adds a note once however often it is added', async () => {
    const added = note('added');
    const editor = createNoteEditorStore({ client: fakeClient([added], 20) });

    editor.appendNote(nip19.noteEncode(added.id));
    editor.appendNote(nip19.neventEncode({ id: added.id }));
    editor.appendNote(added.id);
    expect(get(editor).adding).toEqual([added.id]);
    await vi.waitFor(() => expect(get(editor).adding).toEqual([]));
    editor.appendNote(added.id);

    expect(get(editor)).toMatchObject({ adding: [] });
    expect(contents(get(editor).notes)).toEqual(['added']);
  });

  it('does not add a note that is removed while it is being added', async () => {
    const missing = 'f'.repeat(64);
    const editor = createNoteEditorStore({ client: slowEmptyClient(20) });

    editor.appendNote(missing);
    editor.removeNote(missing);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(get(editor)).toMatchObject({ notes: [], adding: [] });
  });
});
