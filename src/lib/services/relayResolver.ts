import { lastValueFrom, toArray } from 'rxjs';
import { createRxOneshotReq, verify } from 'rx-nostr';
import type { RxNostr, EventPacket } from 'rx-nostr';
import { Kind } from 'nostr-tools';

import { takeTimeout } from '$lib/stores/operators';
import type { RelaySource } from '$lib/stores/cookie';

const FETCH_TIMEOUT = 3000;

function pickLatest(events: EventPacket[]): EventPacket | null {
  if (events.length === 0) return null;
  return events.reduce((a, b) => (a.event.created_at >= b.event.created_at ? a : b));
}

async function fetchKind10002(client: RxNostr, pubkey: string): Promise<string[] | null> {
  const req = createRxOneshotReq({
    filters: [{ kinds: [Kind.RelayList], authors: [pubkey], limit: 1 }]
  });
  const events = await lastValueFrom(
    client.use(req).pipe(verify(), takeTimeout(FETCH_TIMEOUT), toArray())
  );
  const latest = pickLatest(events);
  if (!latest) return null;
  const relays = latest.event.tags
    .filter((t) => t[0] === 'r' && typeof t[1] === 'string' && t[1].startsWith('wss://'))
    .map((t) => t[1]);
  return relays.length > 0 ? relays : null;
}

async function fetchKind3(client: RxNostr, pubkey: string): Promise<string[] | null> {
  const req = createRxOneshotReq({
    filters: [{ kinds: [Kind.Contacts], authors: [pubkey], limit: 1 }]
  });
  const events = await lastValueFrom(
    client.use(req).pipe(verify(), takeTimeout(FETCH_TIMEOUT), toArray())
  );
  const latest = pickLatest(events);
  if (!latest || !latest.event.content) return null;
  try {
    const obj = JSON.parse(latest.event.content) as Record<string, unknown>;
    const relays = Object.keys(obj).filter((u) => u.startsWith('wss://'));
    return relays.length > 0 ? relays : null;
  } catch {
    return null;
  }
}

export async function resolveRelays(
  client: RxNostr,
  source: RelaySource,
  pubkey: string | null,
  defaults: string[]
): Promise<string[]> {
  const fallback: RelaySource[] =
    source === 'kind10002'
      ? ['kind10002', 'kind3', 'default']
      : source === 'kind3'
      ? ['kind3', 'default']
      : ['default'];

  for (const s of fallback) {
    if (s === 'default') return defaults;
    if (!pubkey) continue;
    const relays =
      s === 'kind10002' ? await fetchKind10002(client, pubkey) : await fetchKind3(client, pubkey);
    if (relays) return relays;
  }
  return defaults;
}
