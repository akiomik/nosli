import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { nip19 } from 'nostr-tools';

import type { LoadingNote } from '#lib/entities/LoadingNote.js';
import LongFormContent from '#lib/entities/LongFormContent.js';
import KeyManager, { Nip07CanceledError } from '#lib/services/KeyManager.js';
import {
  openSubscriptionsAt,
  requestsTo,
  setAnswerDelay,
  setAnswerInterval,
  setRelayBehavior,
  setRelayEvents
} from '#lib/testing/FakeWebSocket.js';
import { KIND, publicKeyOf, signWith, type Event } from '#lib/testing/nostr.js';
import { clientOf, disposeClients, failingClient } from '#lib/testing/rxNostr.js';
import { createNoteEditorStore } from './noteEditor';

vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(true), pubkey: writable(''), seckey: writable('') };
});

const key = '1'.repeat(64);
const user = publicKeyOf(key);
const note = (content: string) =>
  signWith(key, { kind: KIND.text, content, created_at: 1, tags: [] });
const reaction = (target: Event, createdAt: number) =>
  signWith(key, {
    kind: KIND.reaction,
    content: '+',
    created_at: createdAt,
    tags: [['e', target.id]]
  });

const relay = 'wss://relay.example.com';

// A client of a fake relay that holds `events`, and answers each request with those that match it
// and EOSE. With `interval`, the events arrive that many milliseconds apart.
const fakeClient = (events: Event[], interval = 0) => {
  setRelayEvents(relay, events);
  if (interval > 0) {
    setAnswerDelay(relay, interval);
    setAnswerInterval(relay, interval);
  }
  return clientOf([relay]);
};

// A client whose relay has nothing, so every request ends empty.
const emptyClient = () => clientOf([relay]);

// A client whose relay has nothing and sends EOSE after `ms` milliseconds.
const slowEmptyClient = (ms: number) => {
  setAnswerDelay(relay, ms);
  return clientOf([relay]);
};

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
  disposeClients();
  vi.restoreAllMocks();
});

describe('createNoteEditorStore', () => {
  it('ends loading recent reactions when the public key cannot be looked up', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(KeyManager, 'getPublicKey').mockRejectedValue(lookupError);

    const editor = createNoteEditorStore({ client: emptyClient() });

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
    const editor = createNoteEditorStore({ client: emptyClient() });
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
    const editor = createNoteEditorStore({ client: emptyClient() });
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
    const withoutTag = signWith(key, {
      kind: KIND.reaction,
      content: '+',
      created_at: 4,
      tags: []
    });
    const withBadTag = signWith(key, {
      kind: KIND.reaction,
      content: '+',
      created_at: 5,
      tags: [['e', 'abc']]
    });
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
    const editor = createNoteEditorStore({ matome: listOf(ids), client: emptyClient() });

    await vi.waitFor(() => expect(get(editor).editorInitialized).toBe(true));
    expect(get(editor).notes).toEqual(ids.map((id) => ({ id, note: undefined, relays: [] })));
  });

  it('can still be used when its requests fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ids = ['e'.repeat(64), 'f'.repeat(64)];
    const client = failingClient(new Error('relay error'));

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
    // The listed note comes from a slow relay, and the added note from a fast one.
    const slow = 'wss://slow.example.com';
    setRelayEvents(slow, [listed]);
    setAnswerDelay(slow, 50);
    setRelayEvents(relay, [added]);
    const editor = createNoteEditorStore({
      matome: listOf([listed.id]),
      client: clientOf([relay, slow])
    });

    editor.appendNote(added.id);
    await vi.waitFor(() => expect(get(editor).adding).toEqual([]));
    expect(get(editor).editorInitialized).toBe(false);
    await vi.waitFor(() => expect(get(editor).editorInitialized).toBe(true));

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

  it('adds a note in an uppercase identifier by its event ID', async () => {
    const added = note('added');
    const editor = createNoteEditorStore({ client: fakeClient([added]) });

    editor.appendNote(nip19.noteEncode(added.id).toUpperCase());

    await vi.waitFor(() => expect(get(editor).notes.map(({ id }) => id)).toEqual([added.id]));
  });

  it('adds a note as soon as a relay returns it, and ends its request', async () => {
    const added = note('added');
    // The relay returns the note but never sends EOSE.
    setRelayBehavior(relay, 'stall');
    const editor = createNoteEditorStore({ client: fakeClient([added]) });

    editor.appendNote(added.id);

    await vi.waitFor(() => expect(get(editor).adding).toEqual([]));
    expect(contents(get(editor).notes)).toEqual(['added']);
    await vi.waitFor(() => expect(openSubscriptionsAt(relay)).toBe(0));
  });

  it('adds a note as not found when its request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const missing = 'f'.repeat(64);
    const editor = createNoteEditorStore({ client: failingClient(new Error('relay closed')) });

    editor.appendNote(missing);

    await vi.waitFor(() => expect(get(editor).adding).toEqual([]));
    expect(get(editor).notes).toEqual([{ id: missing, note: undefined, relays: [] }]);
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

  it('ends the request for a note that is removed while it is being added', async () => {
    const missing = 'f'.repeat(64);
    // The relay never answers. The user's key never comes, so the note is its only request.
    setRelayBehavior(relay, 'silent');
    vi.spyOn(KeyManager, 'getPublicKey').mockReturnValue(new Promise(() => {}));
    const editor = createNoteEditorStore({ client: emptyClient() });

    editor.appendNote(missing);
    await vi.waitFor(() => expect(requestsTo(relay)).toHaveLength(1));
    expect(openSubscriptionsAt(relay)).toBe(1);
    editor.removeNote(missing);

    await vi.waitFor(() => expect(openSubscriptionsAt(relay)).toBe(0));
    expect(get(editor)).toMatchObject({ notes: [], adding: [] });
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

  it('finds an added nevent on the relay it hints at, and keeps the hint', async () => {
    const hinted = note('only on the hinted relay');
    setRelayEvents(hint, [hinted]);
    const editor = createNoteEditorStore({ client: fakeClient([]) });

    editor.appendNote(nip19.neventEncode({ id: hinted.id, relays: [`${hint}/`] }));

    await vi.waitFor(() => expect(get(editor).adding).toEqual([]));
    expect(get(editor).notes).toEqual([
      { id: hinted.id, note: expect.objectContaining({ id: hinted.id }), relays: [hint] }
    ]);
  });

  it('finds the notes of a list on the relays its e tags hint at, and keeps the hints', async () => {
    const hinted = note('only on the hinted relay');
    setRelayEvents(hint, [hinted]);
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
    const editor = createNoteEditorStore({ client: fakeClient([shared]) });

    editor.appendNote(nip19.neventEncode({ id: shared.id, relays: [hint] }));

    await vi.waitFor(() => expect(get(editor).adding).toEqual([]));
    expect(get(editor).notes[0].relays).toEqual(['wss://relay.example.com', hint]);
  });

  it('puts the relay that returned a listed note before the hints that did not', async () => {
    const shared = note('on the shared relay');
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
