import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/prisma-client";

export async function authenticateApiToken(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.replace("Bearer ", "");
  const hashHex = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.personalAccessToken.findFirst({
    where: { tokenHash: hashHex }
  });
  if (!record) return null;
  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) return null;
  return { user: { id: user.id, role: user.role as Role } };
}
