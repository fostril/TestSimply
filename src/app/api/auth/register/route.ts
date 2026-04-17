import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api";
import { authRateLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      passwordRegex,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    ),
});

export const POST = withApiHandler(async (req: NextRequest) => {
  // Stricter rate limit for registration
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rl = authRateLimiter.check(clientIp);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later." },
      { status: 429 },
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

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  // Generate email verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: await bcrypt.hash(parsed.data.password, 12),
    },
  });

  // Store verification token
  await prisma.verificationToken.create({
    data: {
      identifier: user.email,
      token: verificationToken,
      expires: verificationExpiry,
    },
  });

  // In production, send email with verification link.
  // For now we log the token (in non-production) for manual verification.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Auth] Verification token for ${user.email}: ${verificationToken}`);
  }

  return NextResponse.json(
    { id: user.id, message: "Account created. Please verify your email." },
    { status: 201 },
  );
});
