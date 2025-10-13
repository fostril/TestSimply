import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, "settings:manage");
  if (!auth.authorized) return auth.response;
  const token = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await prisma.personalAccessToken.create({
    data: {
      userId: auth.session.user.id,
      tokenHash,
      label: "CI Token",
      scopes: ["import"],
      expiresAt: null
    }
  });
  return NextResponse.json({ token }, { status: 201 });
}
