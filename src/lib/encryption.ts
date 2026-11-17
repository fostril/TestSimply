import crypto from "crypto";
import { logger } from "@/lib/logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const STRICT_BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function isStrictBase64(value: string): boolean {
    return value.length > 0 && value.length % 4 === 0 && STRICT_BASE64_RE.test(value);
}

/**
 * Get encryption key from environment variable.
 * Key must be 32 bytes (256 bits) for AES-256.
 */
function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error("ENCRYPTION_KEY environment variable is not set");
    }

    // If key is base64 encoded (recommended)
    if (key.length === 44) {
        return Buffer.from(key, "base64");
    }

    // If key is hex encoded
    if (key.length === 64) {
        return Buffer.from(key, "hex");
    }

    // If key is raw string (not recommended but supported)
    if (key.length === 32) {
        return Buffer.from(key, "utf8");
    }

    throw new Error(
        "ENCRYPTION_KEY must be 32 bytes. Provide as: " +
        "44 char base64, 64 char hex, or 32 char string. " +
        "Generate with: openssl rand -base64 32"
    );
}

/**
 * Encrypt a string using AES-256-GCM.
 * Returns base64-encoded string: iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8");
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Combine: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);

    return combined.toString("base64");
}

function parseColonFormat(value: string): { iv: Buffer; authTag: Buffer; encrypted: Buffer } | null {
    const parts = value.split(":");
    if (parts.length !== 3) return null;
    if (!parts.every((p) => isStrictBase64(p))) return null;
    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const encrypted = Buffer.from(parts[2], "base64");
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH || encrypted.length < 1) {
        return null;
    }
    return { iv, authTag, encrypted };
}

/**
 * Check if a value matches the encrypted payload format.
 */
export function isEncrypted(value: string): boolean {
    if (!value) return false;

    if (parseColonFormat(value)) {
        return true;
    }

    if (!isStrictBase64(value)) {
        return false;
    }

    const decoded = Buffer.from(value, "base64");
    return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
}

/**
 * Decrypt a string encrypted with encrypt().
 * Expects base64-encoded string: iv + authTag + ciphertext (or iv:tag:cipher).
 *
 * Legacy unencrypted values that do not match the encrypted format are returned
 * as-is for backward compatibility. Values that match the encrypted format MUST
 * decrypt cleanly — otherwise an error is logged and thrown so wrong-key or
 * tampered ciphertext never leaks back as plaintext.
 */
export function decrypt(ciphertext: string): string {
    if (!ciphertext) return ciphertext;

    if (!isEncrypted(ciphertext)) {
        return ciphertext;
    }

    try {
        const colon = parseColonFormat(ciphertext);
        let iv: Buffer;
        let authTag: Buffer;
        let encrypted: Buffer;

        if (colon) {
            iv = colon.iv;
            authTag = colon.authTag;
            encrypted = colon.encrypted;
        } else {
            const combined = Buffer.from(ciphertext, "base64");
            iv = combined.subarray(0, IV_LENGTH);
            authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
            encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
        }

        const key = getEncryptionKey();
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString("utf8");
    } catch (err) {
        logger.error({ err }, "Failed to decrypt encrypted secret");
        throw new Error("Failed to decrypt encrypted value (check ENCRYPTION_KEY)");
    }
}
