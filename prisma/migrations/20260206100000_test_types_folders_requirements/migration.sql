-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('MANUAL', 'CUCUMBER', 'GENERIC');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED');

-- AlterTable: TestCase — add type classification + body fields + folder ref
ALTER TABLE "TestCase"
    ADD COLUMN "type" "TestType" NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN "gherkin" TEXT,
    ADD COLUMN "genericDefinition" TEXT,
    ADD COLUMN "folderId" TEXT;

-- CreateTable: TestFolder (hierarchy for the test repository)
CREATE TABLE "TestFolder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TestFolder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TestFolder_projectId_path_key" ON "TestFolder"("projectId", "path");
CREATE INDEX "TestFolder_projectId_parentId_idx" ON "TestFolder"("projectId", "parentId");

ALTER TABLE "TestFolder"
    ADD CONSTRAINT "TestFolder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "TestFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TestFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestCase"
    ADD CONSTRAINT "TestCase_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "TestFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TestCase_folderId_idx" ON "TestCase"("folderId");

-- CreateTable: Requirement (first-class local requirement, optionally linked to external tracker)
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "RequirementStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "source" TEXT NOT NULL DEFAULT 'LOCAL',
    "externalIssueKey" TEXT,
    "externalUrl" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Requirement_projectId_key_key" ON "Requirement"("projectId", "key");
CREATE INDEX "Requirement_projectId_idx" ON "Requirement"("projectId");

ALTER TABLE "Requirement"
    ADD CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: RequirementLink — add requirementId + type default, make externalUrl nullable
ALTER TABLE "RequirementLink"
    ALTER COLUMN "externalUrl" DROP NOT NULL,
    ALTER COLUMN "type" SET DEFAULT 'covers',
    ADD COLUMN "requirementId" TEXT;

CREATE INDEX "RequirementLink_testCaseId_idx" ON "RequirementLink"("testCaseId");

-- Data migration: for every distinct (projectId, externalUrl) in the legacy
-- RequirementLink table, materialize a Requirement row and point the link at
-- it. External URL is preserved on both the Requirement (as externalUrl) and
-- the link (as a fallback) so nothing is lost.
WITH distinct_urls AS (
    SELECT DISTINCT "projectId", "externalUrl"
    FROM "RequirementLink"
    WHERE "externalUrl" IS NOT NULL AND "externalUrl" <> ''
),
numbered AS (
    SELECT
        "projectId",
        "externalUrl",
        ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "externalUrl") AS n
    FROM distinct_urls
),
inserted AS (
    INSERT INTO "Requirement" (
        "id", "projectId", "key", "title", "description", "status",
        "priority", "source", "externalIssueKey", "externalUrl",
        "tags", "createdAt", "updatedAt"
    )
    SELECT
        -- Deterministic id derived from (projectId, url) so re-running is idempotent.
        'req_' || substr(md5(n."projectId" || '|' || n."externalUrl"), 1, 24),
        n."projectId",
        'REQ-' || n.n,
        -- Try to extract the last path segment as a human-friendly title.
        COALESCE(NULLIF(regexp_replace(n."externalUrl", '.*/', ''), ''), n."externalUrl"),
        NULL,
        'OPEN'::"RequirementStatus",
        'MEDIUM'::"Priority",
        CASE WHEN n."externalUrl" ILIKE '%atlassian.net%' OR n."externalUrl" ILIKE '%/browse/%'
             THEN 'JIRA' ELSE 'LOCAL' END,
        NULL,
        n."externalUrl",
        ARRAY[]::TEXT[],
        NOW(), NOW()
    FROM numbered n
    RETURNING "id", "projectId", "externalUrl"
)
UPDATE "RequirementLink" rl
SET "requirementId" = i."id"
FROM inserted i
WHERE rl."projectId" = i."projectId"
  AND rl."externalUrl" = i."externalUrl";

-- De-duplicate before adding the unique constraint. Keep the earliest row
-- per (requirementId, testCaseId).
DELETE FROM "RequirementLink" a
USING "RequirementLink" b
WHERE a."requirementId" IS NOT NULL
  AND a."requirementId" = b."requirementId"
  AND a."testCaseId" = b."testCaseId"
  AND a."createdAt" > b."createdAt";

-- Standard (non-partial) unique index — NULLs are distinct in PostgreSQL so
-- rows without a requirementId are unaffected. This matches what Prisma
-- generates for `@@unique([requirementId, testCaseId])`.
CREATE UNIQUE INDEX "RequirementLink_requirementId_testCaseId_key"
    ON "RequirementLink"("requirementId", "testCaseId");

ALTER TABLE "RequirementLink"
    ADD CONSTRAINT "RequirementLink_requirementId_fkey"
    FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
