import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY } from 'rxjs';
import { get } from 'svelte/store';
import type { RxNostr } from 'rx-nostr';

import KeyManager from '$lib/services/KeyManager';
import { createNoteEditorStore } from './noteEditor';

vi.mock('$lib/stores/cookie', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(true), pubkey: writable(''), seckey: writable('') };
});

// A client whose relays have nothing, so every request completes empty.
const client = { use: vi.fn(() => EMPTY) } as unknown as RxNostr;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createNoteEditorStore', () => {
  it('ends loading recent reactions when the public key cannot be looked up', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(KeyManager, 'getPublicKey').mockRejectedValue(new Error('Failed to resolve NIP-07'));

    const editor = createNoteEditorStore({ client });

    await vi.waitFor(() => expect(get(editor).searchInitialized).toBe(true));
    expect(get(editor)).toMatchObject({ searchFailed: true, editorInitialized: true });
  });

  it('loads recent reactions when a retry finds the public key', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const getPublicKey = vi
      .spyOn(KeyManager, 'getPublicKey')
      .mockRejectedValueOnce(new Error('Failed to resolve NIP-07'))
      .mockResolvedValue('a'.repeat(64));
    const editor = createNoteEditorStore({ client });
    await vi.waitFor(() => expect(get(editor).searchFailed).toBe(true));

    editor.retrySearch();

    expect(get(editor)).toMatchObject({ searchInitialized: false, searchFailed: false });
    await vi.waitFor(() => expect(get(editor).searchInitialized).toBe(true));
    expect(get(editor).searchFailed).toBe(false);
    expect(getPublicKey).toHaveBeenCalledTimes(2);
  });
});
