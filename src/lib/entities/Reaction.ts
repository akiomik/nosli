import type { Event } from 'nostr-tools';

import Tag from '$lib/entities/Tag';

export default class Reaction {
  constructor(
    public id: string | undefined,
    public content: string,
    public pubkey: string,
    public createdAt: Date,
    public tags: Tag[]
  ) {}

  public static fromEvent(reaction: Event): Reaction {
    const tags: Tag[] = reaction.tags
      .map((tag) => Tag.fromEvent(tag))
      .filter((tag: Tag | undefined): tag is Tag => tag !== undefined);

    return new Reaction(
      reaction.id,
      reaction.content,
      reaction.pubkey,
      new Date(reaction.created_at * 1000),
      tags
    );
  }

  // NIP-25 gives the reacted event in the last e tag. A reaction without one has no event ID.
  eventId(): string | undefined {
    return this.tags.filter((tag: Tag) => tag.typ === 'e').at(-1)?.value;
  }
}
