import { derived, writable } from 'svelte/store';
import type { RxNostr } from 'rx-nostr';

import type { LoadingNote } from '$lib/entities/LoadingNote';
import type LongFormContent from '$lib/entities/LongFormContent';
import { note1ToHex } from '$lib/services/NostrClient';
import KeyManager from '$lib/services/KeyManager';
import { notesStore, noteStore, recentUserReactedNotesStore } from '$lib/stores/nostr';

export function createNoteEditorStore(params: { matome?: LongFormContent; client: RxNostr }) {
  const { matome, client } = params;
  const initNoteIds = matome?.noteIds()?.map(note1ToHex) ?? [];
  const editorInitialized = writable(false);
  const searchInitialized = writable(false);
  const notes = writable<LoadingNote[]>([]);
  const searchedNotes = writable<LoadingNote[]>([]);

  // Initialize Editor tab
  if (initNoteIds.length > 0) {
    notesStore({ client, ids: initNoteIds }).subscribe({
      next: notes.set,
      complete: () => editorInitialized.set(true)
    });
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
    }).subscribe({
      next: searchedNotes.set,
      complete: () => searchInitialized.set(true)
    });
  });

  const appendNote = (noteId: string) => {
    const hex = noteId.startsWith('note1') ? note1ToHex(noteId) : noteId;

    noteStore({ client, id: hex }).subscribe((note) => {
      notes.update((prev) => [
        ...prev,
        {
          id: hex,
          note
        }
      ]);
    });
  };

  const removeNote = (noteId: string) => {
    const hex = noteId.startsWith('note1') ? note1ToHex(noteId) : noteId;
    notes.update((prev) => prev.filter((note) => note.id !== hex));
  };

  const moveUp = (noteId: string) => {
    notes.update((prev) => {
      const idx = prev.findIndex((note) => note.id === noteId);
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
      const idx = prev.findIndex((note) => note.id === noteId);
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

  const sortByLeaastRecentlyCreated = () => {
    notes.update((ns) => {
      return [...ns].sort((a, b) => {
        if (a.note && b.note) {
          return a.note.createdAt.valueOf() - b.note.createdAt.valueOf();
        }

        if (a.note) {
          return 1;
        }

        if (b.note) {
          return -1;
        }

        return 0;
      });
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
  return { subscribe, appendNote, removeNote, moveUp, moveDown, sortByLeaastRecentlyCreated };
}

export type NoteEditorStore = ReturnType<typeof createNoteEditorStore>;
