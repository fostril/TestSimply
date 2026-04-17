import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health — lightweight health check.
 * Returns 200 if the app and database are reachable, 503 otherwise.
 * Excluded from auth middleware via the matcher in middleware.ts.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", message: "Database unreachable", timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
