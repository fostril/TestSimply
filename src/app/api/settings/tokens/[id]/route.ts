import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiHandler } from "@/lib/api";
import { revokePersonalToken } from "@/lib/personal-token";

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req);
    if (!auth.authorized) return auth.response;

    const deleted = await revokePersonalToken(
      params.id,
      auth.session.user.id,
      auth.session.user.role,
    );
    if (!deleted) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  },
);
