import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { hashToken } from "@/lib/password";

async function verifyByToken(rawToken: string | null) {
  if (!rawToken) {
    return { ok: false as const, error: "Verification token is required" };
  }

  const tokenHash = hashToken(rawToken);
  const record = await prisma.verificationToken.findUnique({
    where: { token: tokenHash },
  });

  if (
    !record ||
    record.identifier.startsWith("password-reset:") ||
    record.expires < new Date()
  ) {
    return { ok: false as const, error: "Invalid or expired verification token" };
  }

  const user = await prisma.user.findUnique({
    where: { email: record.identifier },
    select: { id: true, email: true },
  });

  if (!user) {
    return { ok: false as const, error: "User not found" };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.delete({
      where: { token: record.token },
    }),
  ]);

  await logAudit(user.id, "VERIFY_EMAIL", "User", user.id, { email: user.email });
  return { ok: true as const };
}

export const GET = withApiHandler(async (req: NextRequest) => {
  const token = new URL(req.url).searchParams.get("token");
  const wantsJson = req.headers.get("accept")?.includes("application/json");
  const result = await verifyByToken(token);

  if (!result.ok) {
    if (wantsJson) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.redirect(new URL("/auth/login?error=InvalidVerificationToken", req.url));
  }

  if (wantsJson) {
    return NextResponse.json({ ok: true, message: "Email verified" });
  }
  return NextResponse.redirect(new URL("/auth/login?verified=1", req.url));
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const body = (await req.json()) as { token?: string };
  const result = await verifyByToken(body?.token ?? null);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: "Email verified" });
});
