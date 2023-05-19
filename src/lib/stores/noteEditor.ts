import { derived, writable } from 'svelte/store';

import Note from '$lib/entities/Note';
import Reaction from '$lib/entities/Reaction';
import type LongFormContent from '$lib/entities/LongFormContent';
import type RxNostrClient from '$lib/services/RxNostrClient';
import { note1ToHex } from '$lib/services/NostrClient';
import KeyManager from '$lib/services/KeyManager';

interface MaybeNote {
  noteId: string;
  asyncNote: Promise<Note | undefined>;
}

function sortReactions(xs: Reaction[]): Reaction[] {
  return [...xs].sort((a, b) => {
    // order by desc
    return b.createdAt.valueOf() - a.createdAt.valueOf();
  });
}

export function createNoteEditorStore(params: { matome?: LongFormContent; client: RxNostrClient }) {
  const { matome, client } = params;
  const initNoteIds = matome?.noteIds()?.map(note1ToHex) ?? [];
  const editorInitialized = writable(false);
  const searchInitialized = writable(false);
  const notes = writable<MaybeNote[]>([]);
  const notesById: Record<string, Note> = {};
  let sortedReactions: Reaction[] = [];
  const searchedNotes = writable<Note[]>([]);
  const searchedNotesById: Record<string, Note> = {};

  // Initialize Editor tab
  if (initNoteIds.length > 0) {
    const timeout = 500;
    client.observableNotes({ ids: initNoteIds, timeout }).subscribe((envelope) => {
      const note = Note.fromEvent(envelope.event);
      notesById[envelope.event.id] = note;

      notes.set(
        initNoteIds.map((noteId) => {
          const note = notesById[noteId];

          return {
            noteId,
            asyncNote: Promise.resolve(note)
          };
        })
      );
    });

    // TODO: Wait completion of client.observableNotes
    setTimeout(() => {
      editorInitialized.set(true);
    }, timeout);
  } else {
    editorInitialized.set(true);
  }

  // Initialize Search tab
  KeyManager.getPublicKey()
    .then((pubkey) => {
      const limit = 100;
      client
        .observableReactedNotes({ pubkey, limit })
        .subscribe(([reactionEnvelope, noteEnvelope]) => {
          // TODO: sort notes
          const reaction = Reaction.fromEvent(reactionEnvelope.event);
          const note = Note.fromEvent(noteEnvelope.event);
          sortedReactions = sortReactions([...sortedReactions, reaction]);
          searchedNotesById[reaction.eventId()] = note;
          const sortedNotes = sortedReactions.map(
            (reaction) => searchedNotesById[reaction.eventId()]
          );
          searchedNotes.set(sortedNotes.slice(0, limit));
        });
    })
    .finally(() => {
      // TODO: Wait completion of client.observableReactedNotes
      searchInitialized.set(true);
    });

  const appendNote = (noteId: string) => {
    const hex = noteId.startsWith('note1') ? note1ToHex(noteId) : noteId;
    client.observableNote({ id: hex }).subscribe((envelope) => {
      const note = Note.fromEvent(envelope.event);
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
