import { describe, expect, it } from 'vitest';
import { firstValueFrom, from, toArray } from 'rxjs';

import { KIND, publicKeyOf, signWith, type Event, type Filter } from '#lib/testing/nostr.js';
import { requestedEvents } from './operators';

// The checks that every event from a relay goes through before Nosli shows it.

const secret = '7'.repeat(64);
const author = publicKeyOf(secret);
const other = '8'.repeat(64);

const signed = (content: string, tags: string[][] = [], kind: number = KIND.text, key = secret) =>
  signWith(key, { kind, content, created_at: 1_700_000_000, tags });

// The contents of the events that requestedEvents keeps, of those that relays send for `filters`.
const kept = async (events: unknown[], filters: Filter[] = [{ kinds: [KIND.text] }]) => {
  const packets = events.map((event) => ({
    from: 'wss://relay.example.com',
    subId: 'sub',
    event: event as Event
  }));
  const keptPackets = await firstValueFrom(from(packets).pipe(requestedEvents(filters), toArray()));
  return keptPackets.map(({ event }) => event.content);
};

describe('requestedEvents, on the event itself', () => {
  it('keeps an event that its author signed', async () => {
    expect(await kept([signed('genuine')])).toEqual(['genuine']);
  });

  it('drops an event signed by another account than the one that it claims', async () => {
    const forged = { ...signed('forged', [], KIND.text, other), pubkey: author };

    expect(await kept([forged])).toEqual([]);
  });

  it('drops an event changed after it was signed', async () => {
    expect(await kept([{ ...signed('genuine'), content: 'changed' }])).toEqual([]);
  });

  it('drops an event that claims the ID of another', async () => {
    expect(await kept([{ ...signed('claimed'), id: signed('genuine').id }])).toEqual([]);
  });

  it('drops an event with the ID and signature of another', async () => {
    const genuine = signed('genuine');

    expect(await kept([{ ...signed('copied'), id: genuine.id, sig: genuine.sig }])).toEqual([]);
  });

  it.each([
    ['a pubkey in uppercase', { pubkey: author.toUpperCase() }],
    ['a pubkey that is not 32 bytes', { pubkey: author.slice(2) }],
    ['a kind that is not a number', { kind: '1' }],
    ['a created_at that is not a number', { created_at: '1700000000' }],
    ['content that is not a string', { content: 1 }],
    ['tags that are not an array', { tags: {} }],
    ['a tag that is not an array', { tags: ['t'] }],
    ['a tag value that is null', { tags: [['t', null]] }],
    ['a tag value that is a number', { tags: [['t', 1]] }],
    ['no signature', { sig: undefined }],
    ['a signature that is not hex', { sig: 'z'.repeat(128) }]
  ])('drops an event with %s', async (_, change) => {
    expect(await kept([{ ...signed('changed'), ...change }])).toEqual([]);
  });

  it.each([null, undefined, 'event', 1, [], {}])(
    'drops %j, which is not an event',
    async (event) => {
      expect(await kept([event, signed('genuine')])).toEqual(['genuine']);
    }
  );
});

describe('requestedEvents, on the filters', () => {
  const note = '0e'.repeat(32);

  it('keeps an event that matches any filter', async () => {
    const filters = [{ kinds: [KIND.metadata] }, { kinds: [KIND.text], authors: [author] }];

    expect(await kept([signed('genuine')], filters)).toEqual(['genuine']);
  });

  it('matches the kinds, authors, and IDs of a filter', async () => {
    const event = signed('genuine');

    expect(await kept([event], [{ kinds: [KIND.reaction] }])).toEqual([]);
    expect(await kept([event], [{ authors: [publicKeyOf(other)] }])).toEqual([]);
    expect(await kept([event], [{ ids: ['f'.repeat(64)] }])).toEqual([]);
    expect(
      await kept([event], [{ kinds: [KIND.text], authors: [author], ids: [event.id] }])
    ).toEqual(['genuine']);
  });

  it('matches the tags of a filter against any tag of the event', async () => {
    const reaction = signed('+', [
      ['e', 'f'.repeat(64)],
      ['e', note],
      ['p', author]
    ]);

    expect(await kept([reaction], [{ '#e': [note] }])).toEqual(['+']);
    expect(await kept([reaction], [{ '#e': [note], '#p': [author] }])).toEqual(['+']);
    expect(await kept([reaction], [{ '#e': [note], '#p': [publicKeyOf(other)] }])).toEqual([]);
    expect(await kept([reaction], [{ '#e': ['a'.repeat(64)] }])).toEqual([]);
  });

  it('matches the address of an a tag', async () => {
    const address = `${KIND.article}:${author}:my-list`;
    const deletion = signed('Deleted', [['a', address]], KIND.deletion);
    const filter = { kinds: [KIND.deletion], authors: [author] };

    expect(await kept([deletion], [{ ...filter, '#a': [address] }])).toEqual(['Deleted']);
    expect(await kept([deletion], [{ ...filter, '#a': [`${address}2`] }])).toEqual([]);
  });

  it('matches the d tags of a filter against the identifier of the event alone', async () => {
    const list = (content: string, tags: string[][]) => signed(content, tags, KIND.article);
    const lists = [
      list('first d', [['d', 'my-list']]),
      list('second d', [
        ['d', 'other'],
        ['d', 'my-list']
      ]),
      list('no d', []),
      list('empty d', [['d', '']])
    ];
    const filter = (identifiers: string[]) => [{ kinds: [KIND.article], '#d': identifiers }];

    expect(await kept(lists, filter(['my-list']))).toEqual(['first d']);
    expect(await kept(lists, filter(['']))).toEqual(['no d', 'empty d']);
    expect(await kept(lists, filter(['my-list', 'other']))).toEqual(['first d', 'second d']);
  });

  it('matches the other tags of a filter with d tags', async () => {
    const list = signed(
      'list',
      [
        ['d', 'my-list'],
        ['t', 'nosli']
      ],
      KIND.article
    );

    expect(
      await kept([list], [{ kinds: [KIND.article], '#d': ['my-list'], '#t': ['nosli'] }])
    ).toEqual(['list']);
    expect(
      await kept([list], [{ kinds: [KIND.article], '#d': ['my-list'], '#t': ['other'] }])
    ).toEqual([]);
  });
});
