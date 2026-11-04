import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom, from, toArray } from 'rxjs';

import { KIND, newSecretKey, signWith, type Event } from '#lib/testing/nostr.js';
import { requestedEvents } from './operators';

// nostr-tools 2 refuses an event with a tag value that is not a string before Nosli looks at it, but
// nostr-tools 1 did not, and a later version may not either. Its checks are put back as they were in
// version 1, so that only Nosli's own check of the tags drops such an event.
vi.mock('nostr-tools', async (original) => ({
  ...(await original<typeof import('nostr-tools')>()),
  validateEvent: (event: unknown) =>
    typeof event === 'object' && event !== null && Array.isArray((event as Event).tags),
  getEventHash: (event: Event) =>
    createHash('sha256')
      .update(
        JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content])
      )
      .digest('hex')
}));

describe('requestedEvents with the checks of nostr-tools 1', () => {
  const key = newSecretKey();
  const contents = async (events: Event[]) => {
    const packets = events.map((event) => ({
      from: 'wss://relay.example.com',
      subId: 'sub',
      event
    }));
    const kept = await firstValueFrom(
      from(packets).pipe(requestedEvents([{ kinds: [KIND.text] }]), toArray())
    );
    return kept.map(({ event }) => event.content);
  };

  it('keeps an event whose tags hold strings', async () => {
    const event = signWith(key, {
      kind: KIND.text,
      tags: [['t', '1']],
      content: 'string',
      created_at: 1
    });

    expect(await contents([event])).toEqual(['string']);
  });

  it('drops an event with a tag value that is not a string', async () => {
    // nostr-tools signs only tags of strings, so the tag is a string that serializes as a number.
    const tag = Object.assign(['t', '1'], { toJSON: () => ['t', 1] });
    const event = signWith(key, { kind: KIND.text, tags: [tag], content: 'number', created_at: 1 });

    expect(event.tags).toEqual([['t', 1]]);
    expect(await contents([event])).toEqual([]);
  });
});
