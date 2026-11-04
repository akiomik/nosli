import type { nip19 } from 'nostr-tools';

// Nostr timestamps are in whole seconds, rounded from a Date.
export const toSeconds = (date: Date): number => Math.round(date.getTime() / 1000);

export function ensureAddressPointer(
  data: ReturnType<typeof nip19.decode>['data']
): data is nip19.AddressPointer {
  if (typeof data === 'string') {
    return false;
  }

  return 'kind' in data && 'pubkey' in data && 'identifier' in data;
}
