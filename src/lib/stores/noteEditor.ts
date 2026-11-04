import { derived, get, writable } from 'svelte/store';
import { catchError, defaultIfEmpty, map, of, take } from 'rxjs';
import type { Subscription } from 'rxjs';
import type { RxNostr } from 'rx-nostr';

import { isEventId } from '$lib/entities/EventId';
import type { LoadingNote } from '$lib/entities/LoadingNote';
import type LongFormContent from '$lib/entities/LongFormContent';
import { decodeNoteId } from '$lib/services/NostrClient';
import { relayHints } from '$lib/services/relayHints';
import KeyManager from '$lib/services/KeyManager';
import { notesStore, noteStore, recentUserReactedNotesStore } from '$lib/stores/nostr';

export function createNoteEditorStore(params: { matome?: LongFormContent; client: RxNostr }) {
  const { matome, client } = params;
  // The editor lists each note once, so a list that holds a note twice keeps the first.
  const initNotes = (matome?.noteReferences() ?? []).filter(
    (note, i, all) => all.findIndex(({ id }) => id === note.id) === i
  );
  const initNoteIds = initNotes.map(({ id }) => id);
  const editorInitialized = writable(false);
  const searchInitialized = writable(false);
  const searchFailed = writable(false);
  const searchRetrying = writable(false);
  // Notes that no relay returns stay in the list, shown as not found, so that saving keeps them.
  const notes = writable<LoadingNote[]>(
    initNotes.map(({ id, relays }) => ({ id, note: undefined, relays }))
  );
  // IDs of notes being added, which join `notes` once the note arrives or the request ends.
  const adding = writable<string[]>([]);
  const searchedNotes = writable<LoadingNote[]>([]);

  const isListed = (id: string) =>
    get(notes).some((note) => note.id === id) || get(adding).includes(id);

  // Initialize Editor tab
  if (initNoteIds.length > 0) {
    notesStore({ client, ids: initNoteIds, relays: matome?.noteRelays() }).subscribe({
      // Fills in the loaded notes without undoing changes made in the recent reactions tab. The relay
      // that returned a note comes first among its hints.
      next: (loaded) => {
        const loadedById = new Map(loaded.map((entry) => [entry.id, entry]));
        notes.update((prev) =>
          prev.map((entry) => {
            const found = loadedById.get(entry.id);
            if (entry.note || !found?.note) return entry;
            const relays = relayHints([...(found.relays ?? []), ...(entry.relays ?? [])]);
            return { ...entry, note: found.note, relays };
          })
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

  // Reads a hex event ID, or a note or nevent ID in either case, with the relays an nevent hints at.
  const decode = (noteId: string) =>
    isEventId(noteId) ? { id: noteId, relays: [] } : decodeNoteId(noteId);

  // Requests for the notes being added, so that removing a note cancels its request.
  const requests = new Map<string, Subscription>();
  const stopAdding = (id: string) => {
    requests.get(id)?.unsubscribe();
    requests.delete(id);
    adding.update((ids) => ids.filter((x) => x !== id));
  };

  const appendNote = (noteId: string) => {
    const { id: hex, relays } = decode(noteId);
    if (isListed(hex)) return;

    adding.update((ids) => [...ids, hex]);
    // The note joins the list as soon as it arrives, or as not found once no relay returns it. The
    // relay that returned it comes first among its hints.
    const notFound: LoadingNote = { id: hex, note: undefined, relays };
    const request = noteStore({ client, id: hex, relays })
      .pipe(
        take(1),
        map(({ note, relay }): LoadingNote => ({
          ...notFound,
          note,
          relays: relayHints([relay, ...relays])
        })),
        defaultIfEmpty(notFound),
        catchError((error) => {
          console.error(error);
          return of(notFound);
        })
      )
      .subscribe((added) => {
        stopAdding(hex);
        notes.update((prev) => [...prev, added]);
      });
    if (!request.closed) requests.set(hex, request);
  };

  const removeNote = (noteId: string) => {
    const hex = decode(noteId).id;
    stopAdding(hex);
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
