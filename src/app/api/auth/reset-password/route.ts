import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { hashToken, passwordSchema } from "@/lib/password";

const RESET_PREFIX = "password-reset:";

const schema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: passwordSchema,
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const tokenHash = hashToken(parsed.data.token);
  const record = await prisma.verificationToken.findUnique({
    where: { token: tokenHash },
  });

  if (
    !record ||
    !record.identifier.startsWith(RESET_PREFIX) ||
    record.expires < new Date()
  ) {
    return NextResponse.json(
      { error: "Invalid or expired reset token" },
      { status: 400 },
    );
  }

  const email = record.identifier.slice(RESET_PREFIX.length);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Invalid or expired reset token" },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash },
    }),
    prisma.verificationToken.delete({
      where: { token: record.token },
    }),
  ]);

  await logAudit(user.id, "PASSWORD_RESET", "User", user.id, { email: user.email });

  return NextResponse.json({ ok: true, message: "Password updated" });
});
