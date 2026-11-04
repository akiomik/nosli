import { nip19, nip05 } from 'nostr-tools';
import type { Event } from 'nostr-tools';

// nostr-tools keeps the fetch that it finds when it loads, so the one of the moment is looked up at
// each request instead, as a test can replace it.
nip05.useFetchImplementation((...args: Parameters<typeof fetch>) => fetch(...args));

// NIP-01 has the content as a JSON object, but a relay can send anything.
const parseContent = (content: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(content);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

// A field that is not a string is read as missing.
const stringField = (content: Record<string, unknown>, key: string): string | undefined => {
  const value = content[key];
  return typeof value === 'string' ? value : undefined;
};

export default class Profile {
  constructor(
    public id: string | undefined,
    public name: string,
    public displayName: string,
    public picture: string | undefined,
    public nip05: string | undefined,
    public pubkey: string,
    public createdAt: Date,
    public about: string
  ) {}

  // Returns undefined when the content is not a JSON object.
  public static fromEvent(event: Event): Profile | undefined {
    const content = parseContent(event.content);
    if (content === undefined) return undefined;

    return new Profile(
      event.id,
      stringField(content, 'name') ?? '',
      stringField(content, 'display_name') ?? '',
      stringField(content, 'picture'),
      stringField(content, 'nip05'),
      event.pubkey,
      new Date(event.created_at * 1000),
      stringField(content, 'about') ?? ''
    );
  }

  public safePicture(): string | undefined {
    if (this.picture === undefined) {
      return undefined;
    }

    if (this.picture.startsWith('data:image')) {
      return this.picture;
    }

    try {
      const url = new URL(this.picture);
      if (!url.protocol.startsWith('http')) {
        return undefined;
      }

      return url.toString();
    } catch {
      return undefined;
    }
  }

  public nip19Id(): string {
    return nip19.npubEncode(this.pubkey);
  }

  public formattedNip05(): string {
    if (this.nip05 === undefined) {
      return '';
    }

    const nip05 = this.nip05.split('@');
    if (nip05.length === 2 && nip05[0] === '_') {
      return nip05[1];
    }

    return this.nip05;
  }

  public async isNip05Valid(): Promise<boolean> {
    if (this.nip05 === undefined || this.nip05 === '') {
      return false;
    }

    // NIP-05 has the identifier point to the profile's pubkey, not just exist.
    try {
      const res = await nip05.queryProfile(this.nip05);
      return res?.pubkey === this.pubkey;
    } catch {
      return false;
    }
  }

  public formattedName(): string {
    return (
      this.displayName ||
      this.name ||
      `${this.pubkey.slice(0, 8)}:${this.pubkey.slice(-8)}` ||
      'nostrich'
    );
  }
}
