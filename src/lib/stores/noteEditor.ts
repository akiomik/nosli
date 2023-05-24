import { derived, writable } from 'svelte/store';
import type { RxNostr } from 'rx-nostr';

import type Note from '$lib/entities/Note';
import type LongFormContent from '$lib/entities/LongFormContent';
import { note1ToHex } from '$lib/services/NostrClient';
import KeyManager from '$lib/services/KeyManager';
import { notesStore, noteStore, recentUserReactedNotesStore } from '$lib/stores/nostr';

interface MaybeNote {
  noteId: string;
  asyncNote: Promise<Note | undefined>;
}

function zip<A, B>(xs: A[], ys: B[]): [A, B][] {
  return xs.map((x, i) => [x, ys[i]]);
}

export function createNoteEditorStore(params: { matome?: LongFormContent; client: RxNostr }) {
  const { matome, client } = params;
  const initNoteIds = matome?.noteIds()?.map(note1ToHex) ?? [];
  const editorInitialized = writable(false);
  const searchInitialized = writable(false);
  const notes = writable<MaybeNote[]>([]);
  const searchedNotes = writable<Note[]>([]);

  // Initialize Editor tab
  if (initNoteIds.length > 0) {
    const timeout = 500;

    notesStore({ client, ids: initNoteIds, delayTime: timeout }).subscribe((ns) => {
      if (ns === undefined) {
        return;
      }

      const maybeNotes = zip(initNoteIds, ns).map(([noteId, note]) => {
        return {
          noteId,
          asyncNote: Promise.resolve(note)
        };
      });

      notes.set(maybeNotes);
    });

    // TODO: Wait completion of notesStore
    setTimeout(() => editorInitialized.set(true), timeout);
  } else {
    editorInitialized.set(true);
  }

  // Initialize Search tab
  KeyManager.getPublicKey().then((pubkey) => {
    const limit = 100;
    recentUserReactedNotesStore({
      client,
      pubkey,
      limit
    }).subscribe((notes) => {
      searchInitialized.set(true);

      // TODO: change searchedNotes type to (Note | undefined)[] for displaying load error
      searchedNotes.set(
        notes?.filter((note): note is NonNullable<Note> => note !== undefined) ?? []
      );
    });
  });

  const appendNote = (noteId: string) => {
    const hex = noteId.startsWith('note1') ? note1ToHex(noteId) : noteId;

    noteStore({ client, id: hex }).subscribe((note) => {
      notes.update((prev) => [
        ...prev,
        {
          noteId: hex,
          asyncNote: Promise.resolve(note)
        }
      ]);
    });
  };
  const removeNote = (noteId: string) => {
    const hex = noteId.startsWith('note1') ? note1ToHex(noteId) : noteId;
    notes.update((prev) => prev.filter((e) => e.noteId !== hex));
  };
  const moveUp = (noteId: string) => {
    notes.update((prev) => {
      const idx = prev.findIndex((e) => e.noteId === noteId);
      if (idx < 1 || idx >= prev.length) {
        return prev;
      }

      const a = prev[idx];
      const b = prev[idx - 1];
      prev[idx] = b;
      prev[idx - 1] = a;

      return prev;
    });
  };
  const moveDown = (noteId: string) => {
    notes.update((prev) => {
      const idx = prev.findIndex((e) => e.noteId === noteId);
      if (idx < 0 || idx + 1 >= prev.length) {
        return prev;
      }

      const a = prev[idx];
      const b = prev[idx + 1];
      prev[idx] = b;
      prev[idx + 1] = a;

      return prev;
    });
  };

  const { subscribe } = derived(
    [editorInitialized, searchInitialized, notes, searchedNotes],
    ([editorInitialized, searchInitialized, notes, searchedNotes]) => ({
      editorInitialized,
      searchInitialized,
      notes,
      searchedNotes
    })
  );
  return { subscribe, appendNote, removeNote, moveUp, moveDown };
}

export type NoteEditorStore = ReturnType<typeof createNoteEditorStore>;
