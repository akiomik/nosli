import { derived, get, writable } from 'svelte/store';
import type { RxNostr } from 'rx-nostr';

import type { LoadingNote } from '$lib/entities/LoadingNote';
import type LongFormContent from '$lib/entities/LongFormContent';
import type Note from '$lib/entities/Note';
import { nip19ToHex } from '$lib/services/NostrClient';
import KeyManager from '$lib/services/KeyManager';
import { notesStore, noteStore, recentUserReactedNotesStore } from '$lib/stores/nostr';

export function createNoteEditorStore(params: { matome?: LongFormContent; client: RxNostr }) {
  const { matome, client } = params;
  // The editor lists each note once, so a list that holds a note twice keeps the first.
  const initNoteIds = [...new Set(matome?.eventIds() ?? [])];
  const editorInitialized = writable(false);
  const searchInitialized = writable(false);
  const searchFailed = writable(false);
  const searchRetrying = writable(false);
  // Notes that no relay returns stay in the list, shown as not found, so that saving keeps them.
  const notes = writable<LoadingNote[]>(initNoteIds.map((id) => ({ id, note: undefined })));
  // IDs of notes being added, which join `notes` once their request completes.
  const adding = writable<string[]>([]);
  const searchedNotes = writable<LoadingNote[]>([]);

  const isListed = (id: string) =>
    get(notes).some((note) => note.id === id) || get(adding).includes(id);

  // Initialize Editor tab
  if (initNoteIds.length > 0) {
    notesStore({ client, ids: initNoteIds }).subscribe({
      // Fills in the loaded notes without undoing changes made in the recent reactions tab.
      next: (loaded) => {
        const loadedById = new Map(loaded.map(({ id, note }) => [id, note]));
        notes.update((prev) =>
          prev.map(({ id, note }) => ({ id, note: note ?? loadedById.get(id) }))
        );
      },
      complete: () => editorInitialized.set(true)
    });
  } else {
    editorInitialized.set(true);
  }

  // Initialize Search tab
  let searching = false;
  const settleSearch = (failed: boolean) => {
    searching = false;
    searchFailed.set(failed);
    searchRetrying.set(false);
    searchInitialized.set(true);
  };
  const loadSearch = () => {
    searching = true;
    KeyManager.getPublicKey().then(
      (pubkey) => {
        const limit = 100;
        // Show the notes at once, so a retry does not fill them in under the failure message.
        let found: LoadingNote[] = [];
        recentUserReactedNotesStore({
          client,
          pubkey,
          limit
        }).subscribe({
          next: (notes) => (found = notes),
          complete: () => {
            settleSearch(false);
            searchedNotes.set(found);
          }
        });
      },
      (error) => {
        // A missing or refusing NIP-07 extension rejects the lookup.
        console.error(error);
        settleSearch(true);
      }
    );
  };
  loadSearch();

  // The failure message stays until the retry settles, so the focused retry button is not removed.
  const retrySearch = () => {
    if (searching) return;
    searchRetrying.set(true);
    loadSearch();
  };

  const appendNote = (noteId: string) => {
    const hex =
      noteId.startsWith('note1') || noteId.startsWith('nevent1') ? nip19ToHex(noteId) : noteId;
    if (isListed(hex)) return;

    adding.update((ids) => [...ids, hex]);
    let found: Note | undefined;
    noteStore({ client, id: hex }).subscribe({
      next: (note) => (found ??= note),
      complete: () => {
        // The note was removed while it was being added.
        if (!get(adding).includes(hex)) return;
        adding.update((ids) => ids.filter((id) => id !== hex));
        notes.update((prev) => [...prev, { id: hex, note: found }]);
      }
    });
  };

  const removeNote = (noteId: string) => {
    const hex =
      noteId.startsWith('note1') || noteId.startsWith('nevent1') ? nip19ToHex(noteId) : noteId;
    adding.update((ids) => ids.filter((id) => id !== hex));
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
    [
      editorInitialized,
      searchInitialized,
      searchFailed,
      searchRetrying,
      notes,
      adding,
      searchedNotes
    ],
    ([
      editorInitialized,
      searchInitialized,
      searchFailed,
      searchRetrying,
      notes,
      adding,
      searchedNotes
    ]) => ({
      editorInitialized,
      searchInitialized,
      searchFailed,
      searchRetrying,
      notes,
      adding,
      searchedNotes
    })
  );
  return {
    subscribe,
    appendNote,
    removeNote,
    moveUp,
    moveDown,
    sortByLeaastRecentlyCreated,
    retrySearch
  };
}

export type NoteEditorStore = ReturnType<typeof createNoteEditorStore>;
