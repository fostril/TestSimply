import crypto from "crypto";
import { z } from "zod";

export const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(
    passwordRegex,
    "Password must contain at least one uppercase letter, one lowercase letter, and one number",
  );

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
