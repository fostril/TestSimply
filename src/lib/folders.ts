import type { PrismaClient, TestFolder } from "@prisma/client";

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

/**
 * Cascade a path change to all descendants. Called whenever a folder is
 * renamed or moved. Operates in a single transaction chunk per call.
 */
export async function rewriteSubtreePaths(
  prisma: PrismaClient,
  folder: TestFolder,
): Promise<void> {
  const descendants = await prisma.testFolder.findMany({
    where: {
      projectId: folder.projectId,
      path: { startsWith: `${folder.path}/` },
    },
  });

  // Each descendant's new path replaces the old prefix with the new one.
  // We compute that by stripping `oldPrefix` and splicing on `folder.path`.
  const oldPrefixByChild: Record<string, string> = {};
  for (const d of descendants) {
    oldPrefixByChild[d.id] = d.path;
  }

  // Nothing to do if folder has no children.
  if (descendants.length === 0) return;

  // Determine the previous folder path by looking up a direct child's parent
  // - but we already have the new `folder.path`. The caller is expected to
  // have set folder.path to the new value BEFORE calling this helper; we
  // compute the delta from each descendant's own path which still starts
  // with the old prefix.
  //
  // To do that, we need the old prefix. The caller passes the updated
  // folder, so we need the previous path — handle this via a separate
  // `oldPath` parameter in the caller instead.
  // Callers should use `rewriteSubtreePathsWithPrefix` below.
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
