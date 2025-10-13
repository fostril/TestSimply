import { Role } from "@/lib/prisma-client";

type Action =
  | "project:create"
  | "project:update"
  | "project:view"
  | "testcase:create"
  | "testcase:update"
  | "testcase:delete"
  | "testplan:manage"
  | "execution:manage"
  | "execution:run"
  | "settings:manage"
  | "user:manage";

const roleMatrix: Record<Role, Action[]> = {
  [Role.ADMIN]: [
    "project:create",
    "project:update",
    "project:view",
    "testcase:create",
    "testcase:update",
    "testcase:delete",
    "testplan:manage",
    "execution:manage",
    "execution:run",
    "settings:manage",
    "user:manage"
  ],
  [Role.LEAD]: [
    "project:update",
    "project:view",
    "testcase:create",
    "testcase:update",
    "testplan:manage",
    "execution:manage",
    "execution:run",
    "settings:manage"
  ],
  [Role.TESTER]: [
    "project:view",
    "testcase:create",
    "testcase:update",
    "execution:run"
  ],
  [Role.VIEWER]: ["project:view"]
};

export const can = (role: Role | null | undefined, action: Action) => {
  if (!role) return false;
  return roleMatrix[role]?.includes(action) ?? false;
};
