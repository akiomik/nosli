import { nip19, nip05 } from 'nostr-tools';
import type { Event } from 'nostr-tools';

// nostr-tools keeps the fetch that it finds when it loads, so the one of the moment is looked up at
// each request instead, as a test can replace it. It does not follow redirects, as NIP-05 has it.
nip05.useFetchImplementation((...args: Parameters<typeof fetch>) => fetch(...args));

// The domain of a NIP-05 identifier as a request goes to it: in ASCII, as nostr-tools takes only
// that, and so in lowercase. A domain with a port is left as written. Undefined for a domain that is
// not one, including one with whatever a URL would read as other than its host, such as a path, or
// would leave out or decode, such as spaces and escapes, so that the request goes to the domain as
// shown. The characters are checked in NFKC, since a browser's URL reads full-width forms such as
// ％ as the ASCII ones before it decodes them. An ASCII domain must be its own host, which a URL can
// read otherwise, as 127.1 for 127.0.0.1, and so must an IPv4 host whatever else it was written
// with, as １２７.１.
const NOT_IN_DOMAIN = /[\s\p{Cc}/?#\\%@]/u;
const asciiDomain = (domain: string): string | undefined => {
  const normalized = domain.normalize('NFKC');
  if (NOT_IN_DOMAIN.test(normalized)) return undefined;
  if (normalized.includes(':')) return domain;
  try {
    const url = new URL(`https://${domain}`);
    const hostOnly =
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '' &&
      url.username === '' &&
      url.password === '';
    const asShown = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
      ? url.hostname === domain
      : // eslint-disable-next-line no-control-regex
        !/^[\x00-\x7f]*$/.test(domain) || url.hostname === domain.toLowerCase();
    return hostOnly && asShown ? url.hostname : undefined;
  } catch {
    return undefined;
  }
};

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

    // NIP-05 has the identifier point to the profile's pubkey, not just exist. Its names are in
    // lowercase, so a name is asked for in lowercase, and then as written for a domain that lists it
    // so. The identifier is still shown as written.
    const at = this.nip05.lastIndexOf('@');
    const name = at < 0 ? undefined : this.nip05.slice(0, at);
    const domain = asciiDomain(this.nip05.slice(at + 1));
    if (domain === undefined) return false;

    const pubkeyOf = async (name: string | undefined) => {
      try {
        const res = await nip05.queryProfile(name === undefined ? domain : `${name}@${domain}`);
        return res?.pubkey;
      } catch {
        return undefined;
      }
    };
    const pubkey =
      (await pubkeyOf(name?.toLowerCase())) ??
      (name !== undefined && name !== name.toLowerCase() ? await pubkeyOf(name) : undefined);
    return pubkey === this.pubkey;
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
