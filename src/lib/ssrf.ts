import dns from "dns";
import net from "net";

/**
 * SSRF guardrails for outbound requests triggered by user-supplied URLs
 * (Jira, CI, webhooks, etc.).
 *
 * The logic is intentionally conservative:
 *   - Only `http:` and `https:` schemes are allowed.
 *   - IP literals must not point to loopback, link-local, private, or
 *     reserved ranges (IPv4 + IPv6).
 *   - Common bypass hostnames (`localhost`, `*.internal`, metadata services)
 *     are blocked.
 *   - Hostnames are resolved via DNS (`all: true`) and rejected if any
 *     resolved address falls in a private/loopback/link-local/reserved range.
 *
 * Operators who genuinely need to hit internal services can set
 * `ALLOW_PRIVATE_NETWORK_URLS=true` in the environment (not recommended for
 * multi-tenant deployments).
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".internal",
  ".localhost",
];

function isPrivateIPv4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / AWS metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function parseIPv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function parseIPv6(raw: string): number[] | null {
  let addr = raw.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!addr.includes(":")) return null;

  // Expand trailing dotted-quad IPv4 (e.g. ::ffff:127.0.0.1) into 2 hextets
  const lastColon = addr.lastIndexOf(":");
  const tail = addr.slice(lastColon + 1);
  if (tail.includes(".")) {
    const ipv4 = parseIPv4(tail);
    if (!ipv4) return null;
    const hi = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const lo = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    addr = `${addr.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const doubleColonParts = addr.split("::");
  if (doubleColonParts.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const groups = side.split(":");
    const nums: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      nums.push(parseInt(g, 16));
    }
    return nums;
  };

  if (doubleColonParts.length === 2) {
    const left = parseSide(doubleColonParts[0]);
    const right = parseSide(doubleColonParts[1]);
    if (!left || !right) return null;
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    return [...left, ...Array<number>(missing).fill(0), ...right];
  }

  const hextets = parseSide(addr);
  if (!hextets || hextets.length !== 8) return null;
  return hextets;
}

function isPrivateIPv6(hostname: string): boolean {
  const h = parseIPv6(hostname);
  if (!h) return true; // Reject unparseable IPv6-like strings defensively

  const isAllZeroPrefix = (count: number) => h.slice(0, count).every((v) => v === 0);

  // ::/128 (unspecified) and ::1/128 (loopback)
  if (isAllZeroPrefix(7) && (h[7] === 0 || h[7] === 1)) return true;

  // ::ffff:0:0/96 (IPv4-mapped)
  if (isAllZeroPrefix(5) && h[5] === 0xffff) {
    return isPrivateIPv4([(h[6] >> 8) & 0xff, h[6] & 0xff, (h[7] >> 8) & 0xff, h[7] & 0xff]);
  }

  // 64:ff9b::/96 (NAT64 well-known) and 64:ff9b:1::/48 (NAT64 local-use)
  if (h[0] === 0x0064 && h[1] === 0xff9b) {
    if (h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) return true;
    if (h[2] === 1) return true;
  }

  // 100::/64 (discard-only)
  if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true;

  // 2001::/32 (Teredo) and 2001:db8::/32 (documentation)
  if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0x0db8)) return true;

  // 2002::/16 (6to4 -> embedded IPv4 in h[1], h[2])
  if (h[0] === 0x2002) {
    return isPrivateIPv4([(h[1] >> 8) & 0xff, h[1] & 0xff, (h[2] >> 8) & 0xff, h[2] & 0xff]);
  }

  // fc00::/7 (Unique local address)
  if ((h[0] & 0xfe00) === 0xfc00) return true;

  // fe80::/10 (Link-local)
  if ((h[0] & 0xffc0) === 0xfe80) return true;

  // ff00::/8 (Multicast)
  if ((h[0] & 0xff00) === 0xff00) return true;

  return false;
}

function isPrivateIpAddress(address: string): boolean {
  const unbracketed = address.replace(/^\[|\]$/g, "");
  const ipv4 = parseIPv4(unbracketed);
  if (ipv4) return isPrivateIPv4(ipv4);
  if (unbracketed.includes(":")) return isPrivateIPv6(unbracketed);
  return false;
}

/**
 * Synchronous scheme, hostname, and literal-IP validation.
 * Returns the parsed URL (or null when ALLOW_PRIVATE_NETWORK_URLS=true).
 */
export function assertSafeExternalUrlSyntax(rawUrl: string): URL | null {
  if (process.env.ALLOW_PRIVATE_NETWORK_URLS === "true") return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Disallowed URL scheme: ${url.protocol}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const unbracketed = hostname.replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(unbracketed)) {
    throw new Error(`Disallowed hostname: ${unbracketed}`);
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (unbracketed.endsWith(suffix)) {
      throw new Error(`Disallowed hostname suffix: ${suffix}`);
    }
  }

  if (net.isIP(unbracketed) !== 0 && isPrivateIpAddress(unbracketed)) {
    throw new Error(`URL resolves to a private address: ${hostname}`);
  }

  return url;
}

/**
 * Validate URL syntax, literal IPs, and DNS-resolved IP addresses to prevent SSRF.
 */
export async function assertSafeExternalUrl(rawUrl: string): Promise<void> {
  const url = assertSafeExternalUrlSyntax(rawUrl);
  if (!url) return;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const unbracketed = hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(unbracketed) !== 0) {
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.promises.lookup(unbracketed, { all: true });
  } catch {
    throw new Error(`Unable to resolve hostname: ${hostname}`);
  }

  if (!addresses || addresses.length === 0) {
    throw new Error(`Unable to resolve hostname: ${hostname}`);
  }

  for (const entry of addresses) {
    if (isPrivateIpAddress(entry.address)) {
      throw new Error(`URL resolves to a private address: ${hostname}`);
    }
  }
}

const DEFAULT_OUTBOUND_TIMEOUT_MS = 10_000;

/**
 * Perform an outbound fetch protected against SSRF (validates target URL & DNS,
 * disables automatic 30x redirects so targets cannot bounce to internal URLs,
 * and enforces a 10-second timeout unless overridden).
 */
export async function safeExternalFetch(
  rawUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  await assertSafeExternalUrl(rawUrl);
  return fetch(rawUrl, {
    ...init,
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(DEFAULT_OUTBOUND_TIMEOUT_MS),
  });
}
