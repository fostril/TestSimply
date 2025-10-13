import { Role } from "@/lib/prisma-client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { authenticateApiToken } from "@/lib/personal-token";

export async function requireAuth(req: NextRequest, action?: Parameters<typeof can>[1]) {
  const tokenAuth = await authenticateApiToken(req.headers.get("authorization"));
  const session = tokenAuth ?? (await auth());
  if (!session?.user) {
    return { authorized: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const role = (session.user.role ?? Role.VIEWER) as Role;
  if (action && !can(role, action)) {
    return { authorized: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { authorized: true as const, session };
}
