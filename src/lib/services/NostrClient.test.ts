import { describe, it, expect } from 'vitest';
import { decodeNip19 } from './NostrClient';

describe('decodeNip19', () => {
  it('decodes note1 to id without relays', () => {
    const note1 = 'note1l36sphgcnnjv4dcyfjy627gw5fsf5y5n2rrqnh5f8m2hgxavcr0seqmvys';
    const result = decodeNip19(note1);
    expect(result.id).toBe('fc7500dd189ce4cab7044c89a5790ea2609a129350c609de893ed5741bacc0df');
    expect(result.relays).toBeUndefined();
  });

  it('decodes nevent to id with relay hints', () => {
    const nevent =
      'nevent1qvzqqqqqqypzqwyu5j2hjyd3ycyn7s4q4yrcv52mtyc3m3dfg26qf4lpdutjs7pgqyxhwumn8ghj77tpvf6jumt9qys8wumn8ghj7un9d3shjtt2wqhxummnw3ezuamfwfjkgmn9wshx5uqpz9mhxue69uhhytntda4xjunp9e5k7qpql36sphgcnnjv4dcyfjy627gw5fsf5y5n2rrqnh5f8m2hgxavcr0s80yhul';
    const result = decodeNip19(nevent);
    expect(result.id).toBe('fc7500dd189ce4cab7044c89a5790ea2609a129350c609de893ed5741bacc0df');
    expect(result.relays).toEqual([
      'wss://yabu.me',
      'wss://relay-jp.nostr.wirednet.jp',
      'wss://r.kojira.io'
    ]);
  });

  it('throws error for unsupported nip19 type', () => {
    // npub (public key) is not supported
    const npub = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6';
    expect(() => decodeNip19(npub)).toThrow('Unsupported nip19 type: npub');
  });
});
