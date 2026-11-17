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

function isPrivateIPv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (/^fe[89ab]/.test(normalized)) return true; // link-local fe80::/10
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (normalized.startsWith("ff")) return true; // multicast
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    const parts = parseIPv4(mapped);
    if (parts) return isPrivateIPv4(parts);
    // Hex-encoded IPv4-mapped IPv6 e.g. ::ffff:7f00:1
    const hexMatch = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMatch) {
      const hi = parseInt(hexMatch[1], 16);
      const lo = parseInt(hexMatch[2], 16);
      return isPrivateIPv4([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
    }
  }
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
