import { NextResponse } from "next/server";

/** Maximum upload size in bytes (10 MB) */
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  report: [
    "text/xml",
    "application/xml",
    "application/json",
    "text/plain",
  ],
  attachment: [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/json",
    "application/xml",
    "text/xml",
  ],
};

const INLINE_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function isInlineImageMime(mimeType: string): boolean {
  return INLINE_IMAGE_MIME_TYPES.has(mimeType);
}

/**
 * Verify that a file buffer's leading magic bytes match its declared image MIME type.
 */
export function hasValidImageMagicBytes(buf: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/png") {
    // 89 50 4E 47 0D 0A 1A 0A
    return (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    );
  }
  if (mimeType === "image/jpeg") {
    // FF D8 FF
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mimeType === "image/gif") {
    // "GIF87a" or "GIF89a"
    return (
      buf.length >= 6 &&
      buf[0] === 0x47 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x38 &&
      (buf[4] === 0x37 || buf[4] === 0x39) &&
      buf[5] === 0x61
    );
  }
  if (mimeType === "image/webp") {
    // "RIFF" .... "WEBP"
    return (
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    );
  }
  return false;
}

/**
 * Validate an uploaded file from FormData.
 * Returns the File on success, or a NextResponse error.
 */
export function validateUpload(
  file: FormDataEntryValue | null,
  category: keyof typeof ALLOWED_MIME_TYPES = "report",
): File | NextResponse {
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const f = file as File;

  if (f.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_UPLOAD_SIZE / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  const allowed = ALLOWED_MIME_TYPES[category] ?? ALLOWED_MIME_TYPES.report;
  if (!f.type || !allowed.includes(f.type)) {
    return NextResponse.json(
      { error: `File type "${f.type || "unknown"}" is not allowed. Allowed: ${allowed.join(", ")}` },
      { status: 415 },
    );
  }

  return f;
}

/**
 * Validate a JSON body size (for CSV/JSON imports sent as request bodies).
 * Accepts either a string body or a Request whose `Content-Length` header is
 * inspected; returns a 413 `NextResponse` when the body exceeds `maxBytes`.
 */
export function validateBodySize(
  input: string | Request,
  maxBytes: number = MAX_UPLOAD_SIZE,
): NextResponse | null {
  if (typeof input === "string") {
    const size = Buffer.byteLength(input, "utf8");
    if (size > maxBytes) {
      return tooLarge(maxBytes);
    }
    return null;
  }

  const contentLength = input.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (Number.isFinite(size) && size > maxBytes) {
      return tooLarge(maxBytes);
    }
  }
  return null;
}

function tooLarge(maxBytes: number): NextResponse {
  return NextResponse.json(
    { error: `Payload too large. Maximum size is ${maxBytes / 1024 / 1024} MB` },
    { status: 413 },
  );
}
