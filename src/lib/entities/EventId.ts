// NIP-01 gives an event ID as 32 bytes of lowercase hex.
export const isEventId = (value: string): boolean => /^[0-9a-f]{64}$/.test(value);
