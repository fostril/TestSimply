import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { revokePersonalToken } from "@/lib/personal-token";

const DEFAULT_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const createTokenSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  scopes: z.array(z.enum(["import", "full"])).min(1).optional(),
});

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

  let rawBody: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      rawBody = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
  }

  const parsed = createTokenSchema.parse(rawBody);
  const label = parsed.label || "CI Token";
  const scopes = parsed.scopes ?? ["import"];

  let expiresAt: Date;
  if (parsed.expiresAt) {
    expiresAt = new Date(parsed.expiresAt);
    if (expiresAt <= new Date()) {
      return NextResponse.json(
        { error: "expiresAt must be in the future" },
        { status: 400 },
      );
    }
  } else {
    expiresAt = new Date(Date.now() + DEFAULT_TOKEN_TTL_MS);
  }

  const token = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const created = await prisma.personalAccessToken.create({
    data: {
      userId: auth.session.user.id,
      tokenHash,
      label,
      scopes,
      expiresAt,
    },
    select: {
      id: true,
      label: true,
      scopes: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  await logAudit(auth.session.user.id, "CREATE", "PersonalAccessToken", created.id, {
    label: created.label,
    scopes: created.scopes,
    expiresAt: created.expiresAt,
  });

  return NextResponse.json({ ...created, token }, { status: 201 });
});

export const DELETE = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Token id is required" }, { status: 400 });
  }

  const deleted = await revokePersonalToken(id, auth.session.user.id, auth.session.user.role);
  if (!deleted) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
});
