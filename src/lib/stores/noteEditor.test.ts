import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY,
  NEVER,
  Subject,
  concat,
  concatMap,
  delay,
  finalize,
  first,
  from,
  ignoreElements,
  map,
  mergeMap,
  of,
  throwError,
  timer,
  type Observable
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
import { createRxNostr, type RxNostr, type RxReq } from 'rx-nostr';

import type { LoadingNote } from '#lib/entities/LoadingNote.js';
import LongFormContent from '#lib/entities/LongFormContent.js';
import KeyManager, { Nip07CanceledError } from '#lib/services/KeyManager.js';
import { createNoteEditorStore } from './noteEditor';

vi.mock('rx-nostr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('rx-nostr')>()),
  createRxNostr: vi.fn()
}));

vi.mock('#lib/stores/cookie.js', async () => {
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
const fakeClient = (events: Event[], interval = 0, relay = 'wss://relay.example.com') =>
  ({
    getRelays: () => [{ url: relay, read: true, write: true }],
    getAllRelayState: () => ({ [relay]: 'ongoing' }),
    createConnectionStateObservable: () => NEVER,
    setRelays: () => {},
    dispose: () => {},
    use: (req: RxReq) =>
      req.getReqObservable().pipe(
        first((filters) => filters !== null),
        mergeMap((filters) =>
          from(events.filter((event) => matchFilters(filters as Filter[], event)))
        ),
        concatMap((event) => (interval > 0 ? of(event).pipe(delay(interval)) : of(event))),
        map((event) => ({ from: relay, subId: 'sub', event }))
      )
  }) as unknown as RxNostr;

// A client that answers a request for the note `id` with `answer`, and other requests with nothing.
const noteClient = (id: string, answer: () => Observable<Event>) =>
  ({
    use: (req: RxReq) =>
      req.getReqObservable().pipe(
        first((filters) => filters !== null),
        mergeMap((filters) => ((filters as Filter[])[0].ids?.includes(id) ? answer() : EMPTY)),
        map((event) => ({ from: 'wss://relay.example.com', subId: 'sub', event }))
      )
  }) as unknown as RxNostr;

// A client whose relays have nothing, so every request completes empty.
const emptyClient = { use: () => EMPTY } as unknown as RxNostr;

// A client whose relays have nothing and send EOSE after `ms` milliseconds.
const slowEmptyClient = (ms: number) =>
  ({ use: () => timer(ms).pipe(ignoreElements()) }) as unknown as RxNostr;

const listOf = (noteIds: string[]) =>
  LongFormContent.compose({
    identifier: 'list',
    title: 'List',
    summary: '',
    notes: noteIds.map((id) => ({ id }))
  });

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

  it('stops waiting for the public key, and offers a retry that can find it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // An extension whose prompt is left open, until the user stops waiting.
    vi.spyOn(KeyManager, 'getPublicKey')
      .mockImplementationOnce(
        (signal) =>
          new Promise((_, reject) =>
            signal?.addEventListener('abort', () => reject(new Nip07CanceledError()))
          )
      )
      .mockResolvedValue(user);
    const editor = createNoteEditorStore({ client: emptyClient });
    expect(get(editor)).toMatchObject({ searchInitialized: false, searchAwaitingKey: true });

    editor.cancelSearch();

    await vi.waitFor(() => expect(get(editor).searchInitialized).toBe(true));
    expect(get(editor)).toMatchObject({
      searchFailed: true,
      searchCanceled: true,
      searchAwaitingKey: false
    });
    expect(error).not.toHaveBeenCalled();

    editor.retrySearch();

    await vi.waitFor(() => expect(get(editor).searchRetrying).toBe(false));
    expect(get(editor)).toMatchObject({
      searchFailed: false,
      searchCanceled: false,
      searchAwaitingKey: false
    });
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

  it('lists a note that several recent reactions point to once', async () => {
    vi.spyOn(KeyManager, 'getPublicKey').mockResolvedValue(user);
    const liked = note('liked');
    const events = [liked, reaction(liked, 2), reaction(liked, 3)];
    const editor = createNoteEditorStore({ client: fakeClient(events) });

    await vi.waitFor(() => expect(get(editor).searchInitialized).toBe(true));
    expect(get(editor).searchedNotes.map(({ id }) => id)).toEqual([liked.id]);
  });

  it('skips a recent reaction that does not point to an event ID', async () => {
    vi.spyOn(KeyManager, 'getPublicKey').mockResolvedValue(user);
    const liked = note('liked');
    const withoutTag = finishEvent(
      { kind: Kind.Reaction, content: '+', created_at: 4, tags: [] },
      key
    );
    const withBadTag = finishEvent(
      { kind: Kind.Reaction, content: '+', created_at: 5, tags: [['e', 'abc']] },
      key
    );
    const events = [liked, reaction(liked, 2), withoutTag, withBadTag];
    const editor = createNoteEditorStore({ client: fakeClient(events) });

    await vi.waitFor(() => expect(get(editor).searchInitialized).toBe(true));
    expect(get(editor).searchedNotes.map(({ id }) => id)).toEqual([liked.id]);
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
    expect(get(editor).notes).toEqual(ids.map((id) => ({ id, note: undefined, relays: [] })));
  });

  it('can still be used when its requests fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ids = ['e'.repeat(64), 'f'.repeat(64)];
    const client = { use: () => throwError(() => new Error('relay error')) } as unknown as RxNostr;

    const editor = createNoteEditorStore({ matome: listOf(ids), client });

    await vi.waitFor(() => expect(get(editor).editorInitialized).toBe(true));
    expect(get(editor).notes).toEqual(ids.map((id) => ({ id, note: undefined, relays: [] })));
    await vi.waitFor(() => expect(get(editor).searchInitialized).toBe(true));
    expect(get(editor)).toMatchObject({ searchFailed: false, searchedNotes: [] });
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
    expect(get(editor).notes).toEqual([{ id: missing, note: undefined, relays: [] }]);
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

  it('adds a note in an uppercase identifier by its event ID', () => {
    const added = note('added');
    const editor = createNoteEditorStore({ client: fakeClient([added]) });

    editor.appendNote(nip19.noteEncode(added.id).toUpperCase());

    expect(get(editor).notes.map(({ id }) => id)).toEqual([added.id]);
  });

  it('adds a note as soon as a relay returns it, and ends its request', () => {
    const added = note('added');
    const ended = vi.fn();
    // The relay returns the note but never sends EOSE.
    const client = noteClient(added.id, () => concat(of(added), NEVER).pipe(finalize(ended)));
    const editor = createNoteEditorStore({ client });

    editor.appendNote(added.id);

    expect(get(editor).adding).toEqual([]);
    expect(contents(get(editor).notes)).toEqual(['added']);
    expect(ended).toHaveBeenCalled();
  });

  it('adds a note as not found when its request fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const missing = 'f'.repeat(64);
    const client = noteClient(missing, () => throwError(() => new Error('relay closed')));
    const editor = createNoteEditorStore({ client });

    editor.appendNote(missing);

    expect(get(editor)).toMatchObject({ notes: [{ id: missing, note: undefined }], adding: [] });
    expect(consoleError).toHaveBeenCalled();
  });

  it('does not add a note that is removed while it is being added', async () => {
    const added = note('added');
    const editor = createNoteEditorStore({ client: fakeClient([added], 20) });

    editor.appendNote(added.id);
    editor.removeNote(added.id);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(get(editor)).toMatchObject({ notes: [], adding: [] });
  });

  it('ends the request for a note that is removed while it is being added', () => {
    const missing = 'f'.repeat(64);
    const ended = vi.fn();
    // The relay never answers.
    const client = noteClient(missing, () => NEVER.pipe(finalize(ended)));
    const editor = createNoteEditorStore({ client });

    editor.appendNote(missing);
    editor.removeNote(missing);

    expect(ended).toHaveBeenCalled();
  });

  it('adds a note once when it is removed and added again while being added', async () => {
    const added = note('added');
    const editor = createNoteEditorStore({ client: fakeClient([added], 20) });

    editor.appendNote(added.id);
    editor.removeNote(added.id);
    editor.appendNote(added.id);
    await vi.waitFor(() => expect(get(editor).adding).toEqual([]));
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(contents(get(editor).notes)).toEqual(['added']);
  });
});

describe('createNoteEditorStore relay hints', () => {
  const hint = 'wss://hint.example.com';

  beforeEach(() => {
    vi.spyOn(KeyManager, 'getPublicKey').mockResolvedValue(user);
  });

  afterEach(() => {
    vi.mocked(createRxNostr).mockReset();
  });

  it('finds an added nevent on the relay it hints at, and keeps the hint', async () => {
    const hinted = note('only on the hinted relay');
    vi.mocked(createRxNostr).mockReturnValue(fakeClient([hinted], 0, hint));
    const editor = createNoteEditorStore({ client: fakeClient([]) });

    editor.appendNote(nip19.neventEncode({ id: hinted.id, relays: [`${hint}/`] }));

    await vi.waitFor(() => expect(get(editor).adding).toEqual([]));
    expect(get(editor).notes).toEqual([
      { id: hinted.id, note: expect.objectContaining({ id: hinted.id }), relays: [hint] }
    ]);
  });

  it('finds the notes of a list on the relays its e tags hint at, and keeps the hints', async () => {
    const hinted = note('only on the hinted relay');
    vi.mocked(createRxNostr).mockReturnValue(fakeClient([hinted], 0, hint));
    const matome = LongFormContent.compose({
      identifier: 'list',
      title: 'List',
      summary: '',
      notes: [{ id: hinted.id, relays: [hint] }]
    });
    const editor = createNoteEditorStore({
      matome: LongFormContent.fromEvent({ ...matome.toEvent(), pubkey: user }),
      client: fakeClient([])
    });

    await vi.waitFor(() => expect(get(editor).editorInitialized).toBe(true));
    expect(get(editor).notes).toEqual([
      { id: hinted.id, note: expect.objectContaining({ id: hinted.id }), relays: [hint] }
    ]);
  });

  // A list saved with only a dead hint would otherwise point other readers to a relay without it.
  it('puts the relay that returned an added note before the hints that did not', async () => {
    const shared = note('on the shared relay');
    vi.mocked(createRxNostr).mockReturnValue(fakeClient([], 0, hint));
    const editor = createNoteEditorStore({ client: fakeClient([shared]) });

    editor.appendNote(nip19.neventEncode({ id: shared.id, relays: [hint] }));

    await vi.waitFor(() => expect(get(editor).adding).toEqual([]));
    expect(get(editor).notes[0].relays).toEqual(['wss://relay.example.com', hint]);
  });

  it('puts the relay that returned a listed note before the hints that did not', async () => {
    const shared = note('on the shared relay');
    vi.mocked(createRxNostr).mockReturnValue(fakeClient([], 0, hint));
    const matome = LongFormContent.compose({
      identifier: 'list',
      title: 'List',
      summary: '',
      notes: [{ id: shared.id, relays: [hint] }]
    });
    const editor = createNoteEditorStore({
      matome: LongFormContent.fromEvent({ ...matome.toEvent(), pubkey: user }),
      client: fakeClient([shared])
    });

    await vi.waitFor(() => expect(get(editor).editorInitialized).toBe(true));
    expect(get(editor).notes[0].relays).toEqual(['wss://relay.example.com', hint]);
  });
});
