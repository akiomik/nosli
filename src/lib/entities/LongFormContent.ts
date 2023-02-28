import { nip19 } from 'nostr-tools';
import type { Event } from 'nostr-tools';
import Tag from '$lib/entities/Tag';

export default class LongFormContent {
  public static KIND = 30023;

  constructor(
    public id: string | undefined,
    public identifier: string,
    public pubkey: string,
    public content: string,
    public createdAt: Date,
    public title: string,
    public summary: string,
    public image: string | undefined,
    public publishedAt: Date | undefined,
    public tags: Tag[]
  ) {}

  static fromEvent(event: Event): LongFormContent {
    const publishedAt = event.tags.find(([typ]) => typ === 'published_at')?.[1];
    return new LongFormContent(
      event.id,
      event.tags[0][1],
      event.pubkey,
      event.content,
      new Date(event.created_at * 1000),
      event.tags.find(([typ]) => typ === 'title')?.[1] || '',
      event.tags.find(([typ]) => typ === 'summary')?.[1] || '',
      event.tags.find(([typ]) => typ === 'image')?.[1],
      publishedAt === undefined ? undefined : new Date(Number.parseInt(publishedAt, 10) * 1000),
      event.tags
        .map((tag) => Tag.fromEvent(tag))
        .filter((tag: Tag | undefined): tag is Tag => tag !== undefined)
        .filter((tag: Tag) => ['e', 'p'].includes(tag.typ))
    );
  }

  nip19Id(): string {
    return nip19.naddrEncode({
      kind: LongFormContent.KIND,
      pubkey: this.pubkey,
      identifier: this.identifier
    });
  }
}
