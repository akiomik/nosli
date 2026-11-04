import { describe, expect, it } from 'vitest';
import { firstValueFrom, from, toArray } from 'rxjs';
import type { EventPacket } from 'rx-nostr';
import { finishEvent, generatePrivateKey, getPublicKey, Kind } from 'nostr-tools';
import type { Event, Filter } from 'nostr-tools';

import { latestEachNaddr, requestedEvents } from './operators';

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

describe('requestedEvents', () => {
  const key = generatePrivateKey();
  const note = (content: string) =>
    finishEvent({ kind: Kind.Text, content, created_at: 1, tags: [] }, key);
  const contents = async (events: unknown[], filters: Filter[] = [{ kinds: [Kind.Text] }]) => {
    const packets = events.map((event) => ({
      from: 'wss://relay.example.com',
      subId: 'sub',
      event: event as Event
    }));
    const kept = await firstValueFrom(from(packets).pipe(requestedEvents(filters), toArray()));
    return kept.map(({ event }) => event.content);
  };

  it('keeps an event that matches any of the filters', async () => {
    const filters = [
      { kinds: [Kind.Metadata] },
      { kinds: [Kind.Text], authors: [getPublicKey(key)] }
    ];

    expect(await contents([note('genuine')], filters)).toEqual(['genuine']);
  });

  it('drops an event that matches none of the filters', async () => {
    expect(await contents([note('genuine')], [{ kinds: [Kind.Metadata] }])).toEqual([]);
  });

  it('matches the d tags of a filter against the first d tag of the event', async () => {
    const list = (tags: string[][]) =>
      finishEvent({ kind: Kind.Article, content: tags.join(' '), created_at: 1, tags }, key);
    const lists = [
      [['d', 'my-list']],
      [
        ['d', 'other'],
        ['d', 'my-list']
      ],
      [['d', 'other']]
    ].map(list);

    expect(await contents(lists, [{ kinds: [Kind.Article], '#d': ['my-list'] }])).toEqual([
      'd,my-list'
    ]);
  });

  it('takes an event without a d tag to be at the empty identifier', async () => {
    const list = (tags: string[][]) =>
      finishEvent({ kind: Kind.Article, content: `${tags.length} tags`, created_at: 1, tags }, key);
    const lists = [[], [['d']], [['d', '']], [['d', 'other']]].map(list);

    expect(await contents(lists, [{ kinds: [Kind.Article], '#d': [''] }])).toEqual([
      '0 tags',
      '1 tags',
      '1 tags'
    ]);
  });

  it('drops an event whose ID is not its hash', async () => {
    expect(await contents([{ ...note('claimed'), id: note('genuine').id }])).toEqual([]);
  });

  it('drops an event whose signature is wrong', async () => {
    expect(await contents([{ ...note('unsigned'), sig: '0'.repeat(128) }])).toEqual([]);
  });

  it('drops an event without the fields of an event', async () => {
    const { content, ...noContent } = note('no content');

    expect(await contents([null, 'not an event', {}, noContent, content])).toEqual([]);
  });
});
