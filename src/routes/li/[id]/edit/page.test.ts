import { afterEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { KIND } from '#lib/testing/nostr.js';

import { nip07 } from '#lib/stores/cookie.js';
import { LOGIN_DEPENDENCY } from '#lib/stores/login.js';
import { load } from './+page';

vi.mock('#lib/stores/cookie.js', async () => {
  const { writable } = await import('svelte/store');
  return { nip07: writable(false), pubkey: writable(''), seckey: writable('') };
});

const pointer = { kind: KIND.article, pubkey: '01'.repeat(32), identifier: 'my-list' };
const depends = vi.fn();
const run = async () =>
  load({
    params: { id: nip19.naddrEncode(pointer) },
    depends
  } as unknown as Parameters<typeof load>[0]);

afterEach(() => {
  nip07.set(false);
  depends.mockClear();
});

describe('edit page load', () => {
  it('runs again when the login changes', async () => {
    await expect(run()).rejects.toMatchObject({ status: 401 });

    expect(depends).toHaveBeenCalledWith(LOGIN_DEPENDENCY);
  });

  it('gives a user who can sign the address of the list', async () => {
    nip07.set(true);

    await expect(run()).resolves.toMatchObject({ params: pointer });
  });
});
