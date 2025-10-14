-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'LEAD', 'TESTER', 'VIEWER');
CREATE TYPE "TestStatus" AS ENUM ('PASS', 'FAIL', 'BLOCKED', 'SKIPPED');
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "password" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "image" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "PersonalAccessToken" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "expiresAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "PersonalAccessToken_tokenHash_key" ON "PersonalAccessToken"("tokenHash");

CREATE TABLE "Project" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL UNIQUE,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "ProjectSetting" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL UNIQUE REFERENCES "Project"("id") ON DELETE CASCADE,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "components" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "environments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "priorities" "Priority"[] NOT NULL DEFAULT ARRAY['LOW','MEDIUM','HIGH','CRITICAL']::"Priority"[]
);

CREATE TABLE "TestCase" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "preconditions" TEXT,
    "steps" JSONB NOT NULL,
    "expected" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "component" TEXT,
    "ownerId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "deletedAt" TIMESTAMP WITH TIME ZONE,
    CONSTRAINT "TestCase_projectId_key_key" UNIQUE ("projectId", "key")
);

CREATE INDEX "TestCase_projectId_idx" ON "TestCase" ("projectId");

CREATE TABLE "TestPlan" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetVersions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "environments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT "TestPlan_projectId_key_key" UNIQUE ("projectId", "key")
);

CREATE TABLE "TestCasePlan" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "planId" TEXT NOT NULL REFERENCES "TestPlan"("id") ON DELETE CASCADE,
    "caseId" TEXT NOT NULL REFERENCES "TestCase"("id") ON DELETE CASCADE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT "TestCasePlan_planId_caseId_key" UNIQUE ("planId", "caseId")
);

CREATE TABLE "TestExecution" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
    "planId" TEXT REFERENCES "TestPlan"("id") ON DELETE SET NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "environment" TEXT,
    "revision" TEXT,
    "buildUrl" TEXT,
    "commitSha" TEXT,
    "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP WITH TIME ZONE,
    "finishedAt" TIMESTAMP WITH TIME ZONE,
    "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT "TestExecution_projectId_key_key" UNIQUE ("projectId", "key")
);

CREATE TABLE "TestResult" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "executionId" TEXT NOT NULL REFERENCES "TestExecution"("id") ON DELETE CASCADE,
    "caseId" TEXT NOT NULL REFERENCES "TestCase"("id") ON DELETE CASCADE,
    "status" "TestStatus" NOT NULL,
    "durationMs" INTEGER,
    "evidenceURLs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "errorMessage" TEXT,
    "stepsLog" JSONB,
    "retried" BOOLEAN NOT NULL DEFAULT FALSE,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX "TestResult_executionId_idx" ON "TestResult" ("executionId");
CREATE INDEX "TestResult_caseId_idx" ON "TestResult" ("caseId");

CREATE TABLE "RequirementLink" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
    "testCaseId" TEXT NOT NULL REFERENCES "TestCase"("id") ON DELETE CASCADE,
    "externalUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "Attachment" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "testCaseId" TEXT REFERENCES "TestCase"("id") ON DELETE SET NULL,
    "testResultId" TEXT REFERENCES "TestResult"("id") ON DELETE SET NULL,
    "executionId" TEXT REFERENCES "TestExecution"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "AuditLog" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "Account" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_provider_providerAccountId_key" UNIQUE ("provider", "providerAccountId")
);

CREATE TABLE "Session" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "sessionToken" TEXT NOT NULL UNIQUE,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "expires" TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT "VerificationToken_identifier_token_key" UNIQUE ("identifier", "token")
);
