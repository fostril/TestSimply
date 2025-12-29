import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAuth, withApiHandler } from "@/lib/api";

import { z } from "zod";

const uploadSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1)
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:run");
  if (!auth.authorized) return auth.response;

  const body = await req.json();
  const parsed = uploadSchema.parse(body);

  const key = `${crypto.randomUUID()}-${parsed.fileName}`;
  return NextResponse.json({
    uploadUrl: `https://storage.example.com/${key}`,
    url: `https://storage.example.com/${key}`,
    headers: { "x-amz-meta-content-type": parsed.contentType }
  });
});
