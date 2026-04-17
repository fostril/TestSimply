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
  if (f.type && !allowed.includes(f.type)) {
    return NextResponse.json(
      { error: `File type "${f.type}" is not allowed. Allowed: ${allowed.join(", ")}` },
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
