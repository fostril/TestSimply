import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function getAppUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM || "TestSimply <noreply@testsimply.local>";
}

export async function sendMail(options: SendMailOptions): Promise<boolean> {
  const emailServer = process.env.EMAIL_SERVER;
  if (!emailServer) {
    logger.warn({ to: options.to, subject: options.subject }, "EMAIL_SERVER not set; skipping email send");
    return false;
  }

  const transporter = nodemailer.createTransport(emailServer);
  await transporter.sendMail({
    from: getFromAddress(),
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
  return true;
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const verifyUrl = `${getAppUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: email,
    subject: "Verify your TestSimply email",
    text: `Welcome to TestSimply! Verify your email by opening this link: ${verifyUrl}`,
    html: `<p>Welcome to TestSimply!</p><p>Please verify your email address by clicking the link below (valid for 24 hours):</p><p><a href="${verifyUrl}">Verify email</a></p>`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const resetUrl = `${getAppUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: email,
    subject: "Reset your TestSimply password",
    text: `Reset your TestSimply password using this link (valid for 1 hour): ${resetUrl}`,
    html: `<p>You requested a password reset for your TestSimply account.</p><p>Click the link below to set a new password (valid for 1 hour):</p><p><a href="${resetUrl}">Reset password</a></p>`,
  });
}
