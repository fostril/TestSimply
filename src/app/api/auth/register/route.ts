import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, withApiHandler } from "@/lib/api";
import { authRateLimiter } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/mailer";
import { hashToken, passwordSchema } from "@/lib/password";
import { apiLogger } from "@/lib/logger";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: passwordSchema,
});

export const POST = withApiHandler(async (req: NextRequest) => {
  // Stricter rate limit for registration (respecting TRUSTED_PROXY via getClientIp)
  const clientIp = getClientIp(req);
  const rl = await authRateLimiter.checkAsync(clientIp);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later.", retryAfter: rl.retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfter ?? 60),
          "X-RateLimit-Limit": "10",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.reset),
        },
      },
    );
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  // Generate email verification token (store SHA-256 hash in DB)
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(verificationToken);
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: normalizedEmail,
      password: await bcrypt.hash(parsed.data.password, 12),
    },
  });

  await prisma.verificationToken.create({
    data: {
      identifier: user.email,
      token: tokenHash,
      expires: verificationExpiry,
    },
  });

  try {
    await sendVerificationEmail(user.email, verificationToken);
  } catch (err) {
    apiLogger.error({ err, userId: user.id }, "Failed to send verification email");
  }

  return NextResponse.json(
    { id: user.id, message: "Account created. Please verify your email." },
    { status: 201 },
  );
});
