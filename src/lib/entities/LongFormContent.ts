import { nip19 } from 'nostr-tools';
import type Tag from '$lib/entities/Tag';

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

  nip19Id(): string {
    return nip19.naddrEncode({
      kind: LongFormContent.KIND,
      pubkey: this.pubkey,
      identifier: this.identifier
    });
  }
}
