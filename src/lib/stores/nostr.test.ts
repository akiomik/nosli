import { describe, expect, it, vi } from 'vitest';
import { EMPTY, lastValueFrom, toArray } from 'rxjs';
import type { RxNostr } from 'rx-nostr';

import { notesStore } from './nostr';

vi.mock('$lib/stores/cookie', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

// A client whose relays have nothing, so every request completes empty.
const emptyClient = () => {
  const client = { use: vi.fn(() => EMPTY) };
  return client as typeof client & RxNostr;
};

describe('notesStore', () => {
  it('lists every note as not found when no relay returns any of them', async () => {
    const ids = ['e'.repeat(64), 'f'.repeat(64)];

    const emitted = await lastValueFrom(notesStore({ client: emptyClient(), ids }).pipe(toArray()));

    expect(emitted).toEqual([ids.map((id) => ({ id, note: undefined }))]);
  });

  it('does not ask relays for notes when there are no IDs', async () => {
    const client = emptyClient();

    const emitted = await lastValueFrom(notesStore({ client, ids: [] }).pipe(toArray()));

    expect(emitted).toEqual([[]]);
    expect(client.use).not.toHaveBeenCalled();
  });
});
