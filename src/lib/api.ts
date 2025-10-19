import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";

type DefaultSession = {
  user: {
    id: string;
    name: string;
    email: string | null;
    role: Role;
  };
};

const DEFAULT_SESSION: DefaultSession = {
  user: {
    id: "public-user",
    name: "Public User",
    email: null,
    role: Role.ADMIN,
  },
};

type RequireAuthResult = {
  authorized: boolean;
  session: DefaultSession;
  response?: undefined;
};

export async function requireAuth(_req: NextRequest, _action?: unknown): Promise<RequireAuthResult> {
  return {
    authorized: true,
    session: {
      user: { ...DEFAULT_SESSION.user },
    },
    response: undefined,
  };
}
