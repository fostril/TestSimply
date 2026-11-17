import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, isEncrypted } from "@/lib/encryption";

describe("Encryption / decryption", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = originalKey;
    }
  });

  it("round-trips encrypted values", () => {
    const secret = "jira-api-secret-token";
    const encrypted = encrypt(secret);
    expect(encrypted).not.toBe(secret);
    expect(isEncrypted(encrypted)).toBe(true);
    expect(decrypt(encrypted)).toBe(secret);
  });

  it("falls back to returning legacy plaintext values unchanged", () => {
    const legacyPlain = "ghp_legacyPlaintextToken123456";
    expect(isEncrypted(legacyPlain)).toBe(false);
    expect(decrypt(legacyPlain)).toBe(legacyPlain);
  });

  it("throws when an encrypted-looking value fails to decrypt with wrong key", () => {
    const encrypted = encrypt("super-secret");
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");

    expect(() => decrypt(encrypted)).toThrow(/Failed to decrypt/);
  });
});
