import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, withApiHandler } from "@/lib/api";
import { passwordResetRateLimiter } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { hashToken } from "@/lib/password";
import { apiLogger } from "@/lib/logger";

const schema = z.object({
  email: z.string().email("Invalid email address"),
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  const clientIp = getClientIp(req);

  const emailForBucket = parsed.success ? parsed.data.email.trim().toLowerCase() : null;
  const bucketKey =
    clientIp !== "direct"
      ? `ip:${clientIp}`
      : emailForBucket
        ? `email:${emailForBucket}`
        : "direct";

  const rl = await passwordResetRateLimiter.checkAsync(bucketKey);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many password reset requests. Please try again later.", retryAfter: rl.retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfter ?? 3600),
        },
      },
    );
  }

  // Also enforce per-email limit when TRUSTED_PROXY is enabled so distributed IPs
  // cannot spam reset emails for a single target user.
  if (clientIp !== "direct" && emailForBucket) {
    const emailRl = await passwordResetRateLimiter.checkAsync(`email:${emailForBucket}`);
    if (!emailRl.success) {
      return NextResponse.json(
        { error: "Too many password reset requests. Please try again later.", retryAfter: emailRl.retryAfter },
        {
          status: 429,
          headers: {
            "Retry-After": String(emailRl.retryAfter ?? 3600),
          },
        },
      );
    }
  }

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email address", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const email = emailForBucket!;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const identifier = `password-reset:${user.email}`;

    await prisma.verificationToken.deleteMany({
      where: { identifier },
    });

    await prisma.verificationToken.create({
      data: {
        identifier,
        token: tokenHash,
        expires,
      },
    });

    try {
      await sendPasswordResetEmail(user.email, rawToken);
    } catch (err) {
      apiLogger.error({ err, userId: user.id }, "Failed to send password reset email");
    }
  }

  // Always respond 200 to prevent user enumeration
  return NextResponse.json({
    ok: true,
    message: "If an account with that email exists, a password reset link has been sent.",
  });
});
