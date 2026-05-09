import { derived, writable } from 'svelte/store';
import type { RxNostr } from 'rx-nostr';

import type { LoadingNote } from '$lib/entities/LoadingNote';
import type LongFormContent from '$lib/entities/LongFormContent';
import { decodeNip19 } from '$lib/services/NostrClient';
import KeyManager from '$lib/services/KeyManager';
import { notesStore, noteStore, recentUserReactedNotesStore } from '$lib/stores/nostr';

export function createNoteEditorStore(params: { matome?: LongFormContent; client: RxNostr }) {
  const { matome, client } = params;
  const decodedNotes = matome?.noteIds()?.map((id) => decodeNip19(id)) ?? [];
  const seenIds = new Set<string>();
  const initNoteIds = decodedNotes
    .map((d) => d.id)
    .filter((id) => {
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

  // Add relay hints from existing matome to the client
  for (const decoded of decodedNotes) {
    if (decoded.relays && decoded.relays.length > 0) {
      for (const relay of decoded.relays) {
        if (!client.hasRelay(relay)) {
          client.addRelay(relay);
        }
      }
    }
  }

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
    let hex: string;
    let relays: string[] | undefined;

    if (noteId.startsWith('note1') || noteId.startsWith('nevent1')) {
      const decoded = decodeNip19(noteId);
      hex = decoded.id;
      relays = decoded.relays;
    } else {
      hex = noteId;
    }

    // Add relay hints from nevent to the client
    if (relays && relays.length > 0) {
      for (const relay of relays) {
        if (!client.hasRelay(relay)) {
          client.addRelay(relay);
        }
      }
    }

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
    const hex =
      noteId.startsWith('note1') || noteId.startsWith('nevent1') ? decodeNip19(noteId).id : noteId;
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
