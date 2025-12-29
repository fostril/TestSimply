-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_executionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_testCaseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_testResultId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Bug" DROP CONSTRAINT "Bug_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Environment" DROP CONSTRAINT "Environment_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Precondition" DROP CONSTRAINT "Precondition_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProjectSetting" DROP CONSTRAINT "ProjectSetting_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."RequirementLink" DROP CONSTRAINT "RequirementLink_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."RequirementLink" DROP CONSTRAINT "RequirementLink_testCaseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TestCase" DROP CONSTRAINT "TestCase_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TestCasePlan" DROP CONSTRAINT "TestCasePlan_caseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TestCasePlan" DROP CONSTRAINT "TestCasePlan_planId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TestExecution" DROP CONSTRAINT "TestExecution_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TestPlan" DROP CONSTRAINT "TestPlan_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TestResult" DROP CONSTRAINT "TestResult_caseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TestResult" DROP CONSTRAINT "TestResult_executionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TestSet" DROP CONSTRAINT "TestSet_projectId_fkey";

-- AlterTable
ALTER TABLE "Bug" ADD COLUMN     "testCaseId" TEXT,
ADD COLUMN     "testSetId" TEXT;

-- AlterTable
ALTER TABLE "ProjectSetting" ADD COLUMN     "ciProvider" TEXT,
ADD COLUMN     "ciToken" TEXT,
ADD COLUMN     "ciUrl" TEXT,
ADD COLUMN     "ciWorkflowId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProjectCounter" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCounter_projectId_type_key" ON "ProjectCounter"("projectId", "type");

-- CreateIndex
CREATE INDEX "Bug_testCaseId_idx" ON "Bug"("testCaseId");

-- CreateIndex
CREATE INDEX "Bug_testSetId_idx" ON "Bug"("testSetId");

-- CreateIndex
CREATE INDEX "TestExecution_planId_idx" ON "TestExecution"("planId");

-- AddForeignKey
ALTER TABLE "ProjectSetting" ADD CONSTRAINT "ProjectSetting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSet" ADD CONSTRAINT "TestSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Precondition" ADD CONSTRAINT "Precondition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestPlan" ADD CONSTRAINT "TestPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCasePlan" ADD CONSTRAINT "TestCasePlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TestPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCasePlan" ADD CONSTRAINT "TestCasePlan_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestExecution" ADD CONSTRAINT "TestExecution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_testSetId_fkey" FOREIGN KEY ("testSetId") REFERENCES "TestSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "TestExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementLink" ADD CONSTRAINT "RequirementLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementLink" ADD CONSTRAINT "RequirementLink_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_testResultId_fkey" FOREIGN KEY ("testResultId") REFERENCES "TestResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "TestExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCounter" ADD CONSTRAINT "ProjectCounter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
