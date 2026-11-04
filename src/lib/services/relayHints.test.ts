import { describe, expect, it } from 'vitest';

import { normalizeRelayHint, relayHints } from './relayHints';

describe('normalizeRelayHint', () => {
  it('writes a relay URL without a trailing slash, default port, or fragment', () => {
    expect(normalizeRelayHint('wss://Relay.Example.com/')).toBe('wss://relay.example.com');
    expect(normalizeRelayHint('wss://relay.example.com:443#x')).toBe('wss://relay.example.com');
    expect(normalizeRelayHint('wss://relay.example.com/path/')).toBe(
      'wss://relay.example.com/path'
    );
  });

  it('keeps the query, and removes only the trailing slash of the path and the dot of the host', () => {
    expect(normalizeRelayHint('wss://relay.example.com/path/?x=/')).toBe(
      'wss://relay.example.com/path?x=/'
    );
    expect(normalizeRelayHint('wss://relay.example.com./')).toBe('wss://relay.example.com');
    expect(normalizeRelayHint('wss://relay.example.com:7777')).toBe('wss://relay.example.com:7777');
  });

  it('rejects hosts on this device or its local network', () => {
    for (const url of [
      'wss://localhost',
      'wss://localhost.',
      'wss://127.0.0.1:7777',
      'wss://192.168.1.1',
      'wss://2130706433',
      'wss://[::1]',
      'wss://relay.local',
      'wss://relay.localhost',
      'wss://intranet'
    ]) {
      expect(normalizeRelayHint(url), url).toBeUndefined();
    }
  });

  it('rejects a URL that an nevent cannot hold', () => {
    const path = 'a'.repeat(231);
    expect(normalizeRelayHint(`wss://relay.example.com/${path}`)).toHaveLength(255);
    expect(normalizeRelayHint(`wss://relay.example.com/${path}a`)).toBeUndefined();
  });

  it('rejects anything but a wss:// URL without credentials', () => {
    expect(normalizeRelayHint('ws://relay.example.com')).toBeUndefined();
    expect(normalizeRelayHint('https://relay.example.com')).toBeUndefined();
    expect(normalizeRelayHint('wss://user:secret@relay.example.com')).toBeUndefined();
    expect(normalizeRelayHint('relay.example.com')).toBeUndefined();
    expect(normalizeRelayHint('')).toBeUndefined();
  });
});

describe('relayHints', () => {
  it('keeps each valid relay once, in order', () => {
    expect(
      relayHints(['wss://b.example.com', undefined, 'wss://a.example.com/', 'wss://B.example.com/'])
    ).toEqual(['wss://b.example.com', 'wss://a.example.com']);
  });
});
