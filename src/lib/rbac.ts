import { Role } from "@prisma/client";

export type Action =
  | "project:create"
  | "project:update"
  | "project:view"
  | "project:delete"
  | "testcase:create"
  | "testcase:update"
  | "testcase:delete"
  | "testplan:manage"
  | "testset:manage"
  | "execution:manage"
  | "execution:run"
  | "bug:manage"
  | "settings:manage"
  | "user:manage";

export const roleMatrix: Record<Role, Action[]> = {
  [Role.ADMIN]: [
    "project:create",
    "project:update",
    "project:view",
    "project:delete",
    "testcase:create",
    "testcase:update",
    "testcase:delete",
    "testplan:manage",
    "testset:manage",
    "execution:manage",
    "execution:run",
    "bug:manage",
    "settings:manage",
    "user:manage",
  ],
  [Role.LEAD]: [
    "project:create",
    "project:update",
    "project:view",
    "testcase:create",
    "testcase:update",
    "testcase:delete",
    "testplan:manage",
    "testset:manage",
    "execution:manage",
    "execution:run",
    "bug:manage",
    "settings:manage",
  ],
  [Role.TESTER]: [
    "project:view",
    "testcase:create",
    "testcase:update",
    "testset:manage",
    "execution:run",
    "bug:manage",
  ],
  [Role.VIEWER]: ["project:view"],
};

export const can = (role: Role | null | undefined, action: Action): boolean => {
  if (!role) return false;
  return roleMatrix[role]?.includes(action) ?? false;
};
