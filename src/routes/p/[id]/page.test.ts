import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';

import { load } from './+page';

const hex = '01'.repeat(32);
const loadProfile = (id: string) => load({ params: { id } } as Parameters<typeof load>[0]);

describe('profile route', () => {
  it('accepts npub identifiers', async () => {
    await expect(loadProfile(nip19.npubEncode(hex))).resolves.toEqual({ pubkey: hex });
  });

  it('rejects secret-key and profile-pointer identifiers', async () => {
    await expect(loadProfile(nip19.nsecEncode(hex))).rejects.toMatchObject({ status: 404 });
    await expect(loadProfile(nip19.nprofileEncode({ pubkey: hex }))).rejects.toMatchObject({
      status: 404
    });
  });
});
