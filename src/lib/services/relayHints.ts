// An nevent writes the length of each relay in one byte.
const MAX_RELAY_HINT_LENGTH = 255;

// Hosts on this device or its local network, which a list from anyone should not make a viewer
// connect to: IP addresses, names without a dot such as localhost, and local-only domains.
const isLocalHost = (hostname: string): boolean =>
  hostname.startsWith('[') ||
  /^\d+\.\d+\.\d+\.\d+$/.test(hostname) ||
  !hostname.includes('.') ||
  /\.(localhost|local|internal|home\.arpa)$/.test(hostname);

// Relay hints come from IDs and tags that anyone can write, so only wss:// URLs of public hosts,
// without credentials, are kept. They are written without a trailing slash or a trailing dot on the
// host, so the same relay compares equal.
export const normalizeRelayHint = (url: string): string | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'wss:' || parsed.username || parsed.password) return undefined;
  const hostname = parsed.hostname.replace(/\.$/, '');
  if (isLocalHost(hostname)) return undefined;
  const port = parsed.port ? `:${parsed.port}` : '';
  const hint = `wss://${hostname}${port}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
  return hint.length <= MAX_RELAY_HINT_LENGTH ? hint : undefined;
};

export const relayHints = (urls: (string | undefined)[]): string[] => {
  const hints = urls.map((url) => (url ? normalizeRelayHint(url) : undefined));
  return [...new Set(hints.filter((hint): hint is string => hint !== undefined))];
};
