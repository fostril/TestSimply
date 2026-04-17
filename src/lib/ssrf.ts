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
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (normalized.startsWith("::ffff:")) {
    const ipv4 = normalized.slice(7);
    const parts = parseIPv4(ipv4);
    if (parts) return isPrivateIPv4(parts);
  }
  return false;
}

export function assertSafeExternalUrl(rawUrl: string): void {
  if (process.env.ALLOW_PRIVATE_NETWORK_URLS === "true") return;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Disallowed URL scheme: ${url.protocol}`);
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Disallowed hostname: ${hostname}`);
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new Error(`Disallowed hostname suffix: ${suffix}`);
    }
  }

  // IPv4 literal
  const ipv4 = parseIPv4(hostname);
  if (ipv4 && isPrivateIPv4(ipv4)) {
    throw new Error(`URL resolves to a private address: ${hostname}`);
  }

  // IPv6 literal
  if (hostname.includes(":") && isPrivateIPv6(hostname)) {
    throw new Error(`URL resolves to a private address: ${hostname}`);
  }
}
