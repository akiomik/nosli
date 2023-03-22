import { derived, writable } from 'svelte/store';

import type Note from '$lib/entities/Note';
import type LongFormContent from '$lib/entities/LongFormContent';
import NostrClient, { note1ToHex } from '$lib/services/NostrClient';

interface MaybeNote {
  noteId: string;
  asyncNote: Promise<Note | undefined>;
}

export function createNoteEditorStore(params: { matome?: LongFormContent; client: NostrClient }) {
  const { matome, client } = params;
  const initNoteIds = matome?.noteIds()?.map(note1ToHex) ?? [];
  const initialized = writable(false);
  const notes = writable<MaybeNote[]>([]);

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
        initialized.set(true);
      })
      .catch(() => {
        /* Should show error message */
      });
  } else {
    initialized.set(true);
  }

  const appendNote = (noteId: string) => {
    notes.update((prev) => [
      ...prev,
      {
        noteId: note1ToHex(noteId),
        asyncNote: client.getNote(note1ToHex(noteId))
      }
    ]);
  };
  const removeNote = (noteId: string) => {
    notes.update((prev) => prev.filter((e) => e.noteId !== noteId));
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

  const { subscribe } = derived([initialized, notes], ([initialized, notes]) => ({
    initialized,
    notes
  }));
  return { subscribe, appendNote, removeNote, moveUp, moveDown };
}

export type NoteEditorStore = ReturnType<typeof createNoteEditorStore>;
