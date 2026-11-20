import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, withApiHandler } from "@/lib/api";
import { authOptions } from "@/lib/auth";
import { authRateLimiter } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/mailer";
import { hashToken } from "@/lib/password";
import { apiLogger } from "@/lib/logger";

const resendSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
});

const GENERIC_RESPONSE = {
  ok: true,
  message: "If your account requires email verification, a verification link has been sent.",
};

export const POST = withApiHandler(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const parsed = resendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email address", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  let email = parsed.data.email?.trim().toLowerCase();
  if (!email) {
    const session = await getServerSession(authOptions);
    email = session?.user?.email?.trim().toLowerCase();
  }

  if (!email) {
    return NextResponse.json({ error: "Email address is required" }, { status: 400 });
  }

  const clientIp = getClientIp(req);
  const rl = await authRateLimiter.checkAsync(`${clientIp}:resend-verification:${email}`);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many verification requests. Please try again later.", retryAfter: rl.retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfter ?? 60),
          "X-RateLimit-Limit": "10",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.reset),
        },
      }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, password: true, emailVerified: true },
  });

  if (user && user.password && !user.emailVerified) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.verificationToken.deleteMany({
      where: { identifier: user.email },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token: tokenHash,
        expires,
      },
    });

    try {
      await sendVerificationEmail(user.email, rawToken);
    } catch (err) {
      apiLogger.error({ err, userId: user.id }, "Failed to resend verification email");
    }
  }

  return NextResponse.json(GENERIC_RESPONSE);
});
