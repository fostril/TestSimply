import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAuth, withApiHandler } from "@/lib/api";

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:run");
  if (!auth.authorized) return auth.response;
  const { fileName, contentType } = await req.json();
  const key = `${crypto.randomUUID()}-${fileName}`;
  return NextResponse.json({
    uploadUrl: `https://storage.example.com/${key}`,
    url: `https://storage.example.com/${key}`,
    headers: { "x-amz-meta-content-type": contentType }
  });
});
