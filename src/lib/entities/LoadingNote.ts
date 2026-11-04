import type Note from '$lib/entities/Note';

// `relays` hint where the note can be found, the one that returned it first.
export type LoadingNote = { id: string; note: Note | undefined; relays?: string[] };
