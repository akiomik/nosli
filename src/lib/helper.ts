import type { AddressPointer, EventPointer, ProfilePointer } from 'nostr-tools/nip19';

export function ensureAddressPointer(
  data: string | AddressPointer | ProfilePointer | EventPointer
): data is AddressPointer {
  if (typeof data === 'string') {
    return false;
  }

  return 'kind' in data && 'pubkey' in data && 'identifier' in data;
}
