import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req);
  if (!auth.authorized) return auth.response;

  const tokens = await prisma.personalAccessToken.findMany({
    where: { userId: auth.session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      scopes: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return NextResponse.json(tokens);
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req);
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
});
