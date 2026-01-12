import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

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

/**
 * Decrypt a string encrypted with encrypt().
 * Expects base64-encoded string: iv + authTag + ciphertext
 */
export function decrypt(ciphertext: string): string {
    if (!ciphertext) return ciphertext;

    // Check if it's actually encrypted (starts with valid base64 pattern)
    // If it looks like plain text, return as-is for backward compatibility
    try {
        const combined = Buffer.from(ciphertext, "base64");

        // Must be at least IV + AuthTag + 1 byte of data
        if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
            // Probably plain text, return as-is
            return ciphertext;
        }

        const key = getEncryptionKey();
        const iv = combined.subarray(0, IV_LENGTH);
        const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString("utf8");
    } catch {
        // If decryption fails, assume it's plain text (not encrypted)
        // This provides backward compatibility for existing unencrypted tokens
        return ciphertext;
    }
}

/**
 * Check if a value appears to be encrypted.
 */
export function isEncrypted(value: string): boolean {
    if (!value) return false;

    try {
        const decoded = Buffer.from(value, "base64");
        // Encrypted values are at least IV + AuthTag + some data
        return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
    } catch {
        return false;
    }
}
