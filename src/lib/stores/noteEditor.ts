import { derived, writable } from 'svelte/store';

import Note from '$lib/entities/Note';
import type LongFormContent from '$lib/entities/LongFormContent';
import type RxNostrClient from '$lib/services/RxNostrClient';
import { note1ToHex } from '$lib/services/NostrClient';
import KeyManager from '$lib/services/KeyManager';

interface MaybeNote {
  noteId: string;
  asyncNote: Promise<Note | undefined>;
}

export function createNoteEditorStore(params: { matome?: LongFormContent; client: NostrClient }) {
  const { matome, client } = params;
  const initNoteIds = matome?.noteIds()?.map(note1ToHex) ?? [];
  const editorInitialized = writable(false);
  const searchInitialized = writable(false);
  const notes = writable<MaybeNote[]>([]);
  const searchedNotes = writable<Note[]>([]);

  // Initialize Editor tab
  if (initNoteIds.length > 0) {
    client
      .connect()
      .then(() => client.listNotes(initNoteIds))
      .then((loaded) => {
        notes.set(
          initNoteIds.map((noteId) => {
            const note = loaded.find((note) => note.id === noteId);
            if (note) {
              return {
                noteId,
                asyncNote: Promise.resolve(note)
              };
            } else {
              return {
                noteId,
                asyncNote: Promise.resolve(undefined)
              };
            }
          })
        );
      })
      .finally(() => {
        editorInitialized.set(true);
        /* Should show error message */
      });
  } else {
    editorInitialized.set(true);
  }

  // Initialize Search tab
  Promise.all([KeyManager.getPublicKey(), client.connect()])
    .then(([pubkey]) => client.listLikedPost(pubkey, { includesMe: true }))
    .then((notes) => {
      searchedNotes.set(notes);
    })
    .finally(() => {
      searchInitialized.set(true);
    });

  const appendNote = (noteId: string) => {
    const hex = noteId.startsWith('note1') ? note1ToHex(noteId) : noteId;
    notes.update((prev) => [
      ...prev,
      {
        noteId: hex,
        asyncNote: client.getNote(hex)
      }
    ]);
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
      console.log(prev);
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
