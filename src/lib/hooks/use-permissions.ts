"use client";

import { useSession } from "next-auth/react";
import { can, type Action } from "@/lib/rbac";
import type { Role } from "@prisma/client";

export function usePermissions() {
  const { data: session } = useSession();
  const role = ((session?.user as { role?: Role } | undefined)?.role ?? null) as Role | null;
  return {
    role,
    can: (action: Action) => can(role, action),
  };
}
