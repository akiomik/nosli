import { nip19, Kind } from 'nostr-tools';
import type { Event } from 'nostr-tools';
import Tag from '$lib/entities/Tag';

const nosliTag = new Tag('t', 'nosli');

const isNosliTag = ([typ, value]: string[]): boolean =>
  typ === nosliTag.typ && value === nosliTag.value;

// NIP-23 gives published_at as a string of seconds.
const parseTimestamp = (value: string | undefined): Date | undefined => {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

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
    // Tags that Nosli neither reads nor rebuilds, written back with an update.
    public otherTags: string[][] = []
  ) {}

  static fromEvent(event: Event): LongFormContent {
    const value = (typ: string) => event.tags.find((tag) => tag[0] === typ)?.[1];
    const publishedAt = parseTimestamp(value('published_at'));
    // Nosli reads these tags into fields or rebuilds them, except a published_at that it cannot
    // read. A client tag names the app that published the event, so Nosli drops it on update.
    const ownTypes = ['d', 'title', 'summary', 'image', 'e', 'client'];
    if (publishedAt) ownTypes.push('published_at');
    const isOwnTag = (tag: string[]) => ownTypes.includes(tag[0]) || isNosliTag(tag);

    return new LongFormContent(
      event.id,
      value('d') ?? '',
      event.pubkey,
      event.content,
      new Date(event.created_at * 1000),
      value('title') || '',
      value('summary') || '',
      value('image'),
      publishedAt,
      event.tags
        .filter((tag) => tag[0] === 'e' || isNosliTag(tag))
        .map((tag) => Tag.fromEvent(tag))
        .filter((tag: Tag | undefined): tag is Tag => tag !== undefined),
      // NIP-01 tags hold only strings, and a null value would make the update impossible to sign.
      event.tags.filter((tag) => !isOwnTag(tag) && tag.every((v) => typeof v === 'string'))
    );
  }

  // Builds a new list, or an update of `previous` that keeps its image, published_at, and other
  // tags. The content is always rebuilt from the notes.
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

  // The address of every version of this list, as NIP-01 defines it for addressable events.
  address(): string {
    return `${Kind.Article}:${this.pubkey}:${this.identifier}`;
  }

  // NIP-09: only the author's requests count, and an `a` tag covers the versions up to the request,
  // so a list published again after its deletion is not deleted.
  isDeletedBy(requests: Event[]): boolean {
    const createdAt = Math.round(this.createdAt.getTime() / 1000);
    return requests.some(
      (request) =>
        request.kind === Kind.EventDeletion &&
        request.pubkey === this.pubkey &&
        request.tags.some(
          ([typ, value]) =>
            (typ === 'e' && value === this.id) ||
            (typ === 'a' && value === this.address() && createdAt <= request.created_at)
        )
    );
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
}
