import { nip19, Kind } from 'nostr-tools';
import type { Event } from 'nostr-tools';
import Tag from '$lib/entities/Tag';

const nosliTag = new Tag('t', 'nosli');

// Nosli reads these tags into fields or rebuilds them from the editor.
const isOwnTag = ([typ, value]: string[]): boolean =>
  ['d', 'title', 'summary', 'image', 'published_at', 'e'].includes(typ) ||
  (typ === nosliTag.typ && value === nosliTag.value);

export default class LongFormContent {
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
    public tags: Tag[],
    // Tags from other clients, written back unchanged so that an update does not drop them.
    public otherTags: string[][] = []
  ) {}

  static fromEvent(event: Event): LongFormContent {
    const value = (typ: string) => event.tags.find((tag) => tag[0] === typ)?.[1];
    const publishedAt = value('published_at');
    return new LongFormContent(
      event.id,
      value('d') ?? '',
      event.pubkey,
      event.content,
      new Date(event.created_at * 1000),
      value('title') || '',
      value('summary') || '',
      value('image'),
      publishedAt === undefined ? undefined : new Date(Number.parseInt(publishedAt, 10) * 1000),
      event.tags
        .filter((tag) => isOwnTag(tag) && ['e', 't'].includes(tag[0]))
        .map((tag) => Tag.fromEvent(tag))
        .filter((tag: Tag | undefined): tag is Tag => tag !== undefined),
      event.tags.filter((tag) => !isOwnTag(tag))
    );
  }

  // Builds a new list, or an update of `previous` that keeps what the editor does not change.
  static compose(params: {
    identifier: string;
    title: string;
    summary: string;
    noteIds: string[];
    previous?: LongFormContent;
  }): LongFormContent {
    const { identifier, title, summary, noteIds, previous } = params;
    return new LongFormContent(
      undefined,
      identifier,
      '',
      noteIds.map((id) => `nostr:${nip19.neventEncode({ id })}`).join('\n'),
      new Date(),
      title,
      summary,
      previous?.image,
      previous?.publishedAt,
      [...noteIds.map((id) => new Tag('e', id, '', 'mention')), nosliTag],
      previous?.otherTags
    );
  }

  toEvent(): Event {
    const tags = [
      ['d', this.identifier],
      ['title', this.title],
      ['summary', this.summary],
      ...this.tags.map((tag: Tag) => {
        return [tag.typ, tag.value];
      }),
      ...this.otherTags
    ];
    if (this.image) {
      tags.push(['image', this.image]);
    }
    if (this.publishedAt) {
      tags.push(['published_at', Math.round(this.publishedAt.getTime() / 1000).toString()]);
    }

    const event = {
      id: this.id || '',
      sig: '',
      kind: Kind.Article,
      content: this.content,
      pubkey: this.pubkey,
      created_at: Math.round(this.createdAt.getTime() / 1000),
      tags
    };

    return event;
  }

  nip19Id(): string {
    return nip19.naddrEncode({
      kind: Kind.Article,
      pubkey: this.pubkey,
      identifier: this.identifier
    });
  }

  eventIds(): string[] {
    return this.tags.filter((tag: Tag) => tag.typ === 'e').map((tag) => tag.value);
  }

  includesTag(tag: Tag): boolean {
    return this.tags.some((t) => {
      return t.equals(tag);
    });
  }
}
