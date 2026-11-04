import { describe, expect, it } from 'vitest';
import { firstValueFrom, from, toArray } from 'rxjs';
import type { EventPacket } from 'rx-nostr';

import { latestEachNaddr } from './operators';

const packet = (createdAt: number, tags: string[][]): EventPacket =>
  ({
    from: 'wss://relay.example.com',
    subId: 'sub',
    event: {
      id: String(createdAt),
      kind: 30023,
      pubkey: 'a'.repeat(64),
      created_at: createdAt,
      tags
    }
  }) as EventPacket;

describe('latestEachNaddr', () => {
  it('drops an older version even when its d tag is not first', async () => {
    const newer = packet(2, [['d', 'my-list']]);
    const older = packet(1, [
      ['title', 'Old title'],
      ['d', 'my-list']
    ]);

    const packets = await firstValueFrom(from([newer, older]).pipe(latestEachNaddr(), toArray()));

    expect(packets).toEqual([newer]);
  });
});
