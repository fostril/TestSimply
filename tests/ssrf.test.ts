import dns from "dns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertSafeExternalUrl, safeExternalFetch } from "@/lib/ssrf";

describe("SSRF guard (assertSafeExternalUrl)", () => {
  const originalEnv = process.env.ALLOW_PRIVATE_NETWORK_URLS;

  beforeEach(() => {
    delete process.env.ALLOW_PRIVATE_NETWORK_URLS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env.ALLOW_PRIVATE_NETWORK_URLS;
    } else {
      process.env.ALLOW_PRIVATE_NETWORK_URLS = originalEnv;
    }
  });

  it("blocks localhost", async () => {
    await expect(assertSafeExternalUrl("http://localhost:3000/api")).rejects.toThrow(/Disallowed hostname/);
  });

  it("blocks literal private IPv4 (10.0.0.5)", async () => {
    await expect(assertSafeExternalUrl("http://10.0.0.5/jira")).rejects.toThrow(/private address/);
  });

  it("blocks non-http/https schemes such as ftp", async () => {
    await expect(assertSafeExternalUrl("ftp://example.com/file")).rejects.toThrow(/Disallowed URL scheme/);
  });

  it("blocks hostnames whose DNS resolves to 127.0.0.1 or private IPs", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ] as any);

    await expect(assertSafeExternalUrl("https://evil.example.com/hook")).rejects.toThrow(/private address/);
  });

  it("allows public host resolving to a public IP", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as any);

    await expect(assertSafeExternalUrl("https://example.com/rest/api/3")).resolves.toBeUndefined();
  });

  it("allows private URLs when ALLOW_PRIVATE_NETWORK_URLS=true", async () => {
    process.env.ALLOW_PRIVATE_NETWORK_URLS = "true";
    await expect(assertSafeExternalUrl("http://127.0.0.1:8080/jira")).resolves.toBeUndefined();
    await expect(assertSafeExternalUrl("http://localhost:8080/ci")).resolves.toBeUndefined();
  });

  it("blocks reserved IPv6 ranges (NAT64, discard, documentation, 6to4 private, link-local)", async () => {
    await expect(assertSafeExternalUrl("http://[64:ff9b::127.0.0.1]/")).rejects.toThrow(/private address/);
    await expect(assertSafeExternalUrl("http://[100::1]/")).rejects.toThrow(/private address/);
    await expect(assertSafeExternalUrl("http://[2001:db8::1]/")).rejects.toThrow(/private address/);
    await expect(assertSafeExternalUrl("http://[2002:7f00:0001::1]/")).rejects.toThrow(/private address/);
    await expect(assertSafeExternalUrl("http://[fe80::1]/")).rejects.toThrow(/private address/);
  });

  it("enforces redirect: 'error' and AbortSignal timeout in safeExternalFetch", async () => {
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as any);
    const origFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as any;
    try {
      await safeExternalFetch("https://example.com/api");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.com/api",
        expect.objectContaining({
          redirect: "error",
          signal: expect.any(AbortSignal),
        }),
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
