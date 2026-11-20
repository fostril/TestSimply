import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { logAudit } from "@/lib/audit";

export function isTokenScopeAllowed(scopes: string[], pathname: string): boolean {
  if (scopes.includes("*") || scopes.includes("full")) {
    return true;
  }
  if (scopes.includes("import")) {
    return (
      pathname === "/api/import" ||
      pathname.startsWith("/api/import/") ||
      pathname === "/api/imports" ||
      pathname.startsWith("/api/imports/") ||
      pathname === "/api/testcases/import" ||
      pathname === "/api/results" ||
      pathname.startsWith("/api/results/")
    );
  }
  return false;
}

export async function authenticateApiToken(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const hashHex = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.personalAccessToken.findFirst({
    where: { tokenHash: hashHex },
  });
  if (!record) return null;

  // Check token expiration
  if (record.expiresAt && record.expiresAt < new Date()) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) return null;
  return {
    tokenId: record.id,
    scopes: record.scopes,
    user: { id: user.id, role: user.role as Role },
  };
}

export async function revokePersonalToken(
  tokenId: string,
  actorId: string,
  actorRole: Role,
): Promise<boolean> {
  const existing = await prisma.personalAccessToken.findUnique({
    where: { id: tokenId },
    select: { id: true, userId: true, label: true, scopes: true },
  });
  if (!existing) return false;
  if (existing.userId !== actorId && actorRole !== Role.ADMIN) {
    return false;
  }

  await prisma.personalAccessToken.delete({ where: { id: existing.id } });
  await logAudit(actorId, "DELETE", "PersonalAccessToken", existing.id, {
    label: existing.label,
    scopes: existing.scopes,
  });
  return true;
}
