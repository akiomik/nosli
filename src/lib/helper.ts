import type { nip19 } from 'nostr-tools';

export function ensureAddressPointer(
  data: ReturnType<typeof nip19.decode>['data']
): data is nip19.AddressPointer {
  if (typeof data === 'string') {
    return false;
  }

  return 'kind' in data && 'pubkey' in data && 'identifier' in data;
}
