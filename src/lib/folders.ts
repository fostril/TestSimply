import type { PrismaClient } from "@prisma/client";

/**
 * Slugify a folder name into a path segment. Matches basic filesystem-safe
 * characters and collapses whitespace/dashes.
 */
export function slugifySegment(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "folder";
}

export function buildPath(parentPath: string | null, name: string): string {
  const segment = slugifySegment(name);
  if (!parentPath || parentPath === "/") return `/${segment}`;
  return `${parentPath.replace(/\/+$/, "")}/${segment}`;
}

/**
 * Walk the parent chain to detect cycles before reparenting a folder.
 * Returns true if `candidateParentId` is either the folder itself or one of
 * its descendants.
 */
export async function wouldIntroduceCycle(
  prisma: PrismaClient,
  folderId: string,
  candidateParentId: string,
): Promise<boolean> {
  if (folderId === candidateParentId) return true;
  let cursor: string | null = candidateParentId;
  // Guard against already-corrupt data — bail after a reasonable depth.
  for (let i = 0; i < 64 && cursor; i++) {
    const node: { parentId: string | null } | null =
      await prisma.testFolder.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
    if (!node) return false;
    if (node.parentId === folderId) return true;
    cursor = node.parentId;
  }
  return false;
}

export async function rewriteSubtreePathsWithPrefix(
  prisma: PrismaClient,
  projectId: string,
  oldPrefix: string,
  newPrefix: string,
): Promise<void> {
  const descendants = await prisma.testFolder.findMany({
    where: {
      projectId,
      path: { startsWith: `${oldPrefix}/` },
    },
    select: { id: true, path: true },
  });

  await prisma.$transaction(
    descendants.map((d) =>
      prisma.testFolder.update({
        where: { id: d.id },
        data: { path: newPrefix + d.path.slice(oldPrefix.length) },
      }),
    ),
  );
}
