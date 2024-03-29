import { nip19 } from 'nostr-tools';
import type { Event } from 'nostr-tools';

import type Profile from '$lib/entities/Profile';
import Tag from '$lib/entities/Tag';

export default class Note {
  constructor(
    public id: string | undefined,
    public content: string,
    public pubkey: string,
    public createdAt: Date,
    public tags: Tag[],
    public asyncProfile: Promise<Profile | undefined> | undefined,
    public reactions: number | undefined = undefined
  ) {}

  public static fromEvent(note: Event): Note {
    const tags: Tag[] = note.tags
      .map((tag) => Tag.fromEvent(tag))
      .filter((tag: Tag | undefined): tag is Tag => tag !== undefined);

    return new Note(
      note.id,
      note.content,
      note.pubkey,
      new Date(note.created_at * 1000),
      tags,
      undefined
    );
  }

  private replaceNip08(content: string): string {
    this.tags.forEach((tag, i) => {
      if (!tag.isEvent() && !tag.isPubkey()) {
        return;
      }

      const regexp = new RegExp(`#\\[${i}\\]`, 'g');
      let id: string;

      if (tag.isEvent()) {
        id = nip19.noteEncode(tag.value);
      } else {
        id = nip19.npubEncode(tag.value); // TODO: show name
      }

      content = content.replace(regexp, `@${id}`);
    });

    return content;
  }

  private replaceNip27(content: string): string {
    return content.replace(/nostr:((npub|nprofile|note|nevent|naddr)1[a-z0-9]{6,})/g, '@$1');
  }

  public modifiedContent(): string {
    return this.replaceNip27(this.replaceNip08(this.content));
  }

  public nip19Id(): string | undefined {
    if (this.id === undefined) {
      return undefined;
    }

    return nip19.noteEncode(this.id);
  }

  public setAsyncProfile(asyncProfile: Promise<Profile | undefined>) {
    this.asyncProfile = asyncProfile;
  }

  public setReactions(reactions: number) {
    this.reactions = reactions;
  }
}
