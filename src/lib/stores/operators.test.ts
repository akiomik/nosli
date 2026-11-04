import { describe, expect, it } from 'vitest';
import { firstValueFrom, from, toArray } from 'rxjs';
import type { EventPacket } from 'rx-nostr';
import { finishEvent, generatePrivateKey, getPublicKey, Kind } from 'nostr-tools';
import type { Event, Filter, EventTemplate } from 'nostr-tools';

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
      finishEvent({ kind: Kind.Article, content: JSON.stringify(tags), created_at: 1, tags }, key);
    const lists = [[], [['d']], [['d', '']], [['d', 'other']]].map(list);

    expect(await contents(lists, [{ kinds: [Kind.Article], '#d': [''] }])).toEqual([
      '[]',
      '[["d"]]',
      '[["d",""]]'
    ]);
  });

  it('drops an event whose ID is not its hash', async () => {
    expect(await contents([{ ...note('claimed'), id: note('genuine').id }])).toEqual([]);
  });

  it('drops an event whose signature is wrong', async () => {
    expect(await contents([{ ...note('unsigned'), sig: '0'.repeat(128) }])).toEqual([]);
  });

  it('keeps each event once, and the first valid copy of it', async () => {
    const genuine = note('genuine');
    const badSignature = { ...genuine, sig: '0'.repeat(128) };
    const packets = [badSignature, genuine, genuine].map((event, i) => ({
      from: `wss://relay${i}.example.com`,
      subId: 'sub',
      event
    }));

    const kept = await firstValueFrom(
      from(packets).pipe(requestedEvents([{ kinds: [Kind.Text] }]), toArray())
    );

    expect(kept.map(({ from }) => from)).toEqual(['wss://relay1.example.com']);
  });

  it('keeps an event again for another subscription', async () => {
    const events = from([note('genuine')].map((event) => ({ from: 'wss://r', subId: 's', event })));
    const kept = events.pipe(requestedEvents([{ kinds: [Kind.Text] }]), toArray());

    expect(await firstValueFrom(kept)).toHaveLength(1);
    expect(await firstValueFrom(kept)).toHaveLength(1);
  });

  it('drops an event with a tag value that is not a string', async () => {
    const unsigned = { kind: Kind.Text, tags: [['t', 1]], content: 'number', created_at: 1 };
    // Signed as it is, so that only the type of the tag value is wrong.
    const event = finishEvent(unsigned as unknown as EventTemplate, key);

    expect(event.tags).toEqual([['t', 1]]);
    expect(await contents([event])).toEqual([]);
  });

  it('drops an event dated beyond what a Date can hold', async () => {
    const dated = (content: string, createdAt: number) =>
      finishEvent({ kind: Kind.Text, content, created_at: createdAt, tags: [] }, key);

    expect(await contents([dated('latest', 8.64e12), dated('too late', 8.64e12 + 1)])).toEqual([
      'latest'
    ]);
  });

  it('drops an event without the fields of an event', async () => {
    const { content, ...noContent } = note('no content');

    expect(await contents([null, 'not an event', {}, noContent, content])).toEqual([]);
  });
});
