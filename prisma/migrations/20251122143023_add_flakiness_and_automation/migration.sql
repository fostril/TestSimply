-- AlterTable
ALTER TABLE "TestCase" ADD COLUMN     "automationId" TEXT,
ADD COLUMN     "flakyDetectedAt" TIMESTAMP(3),
ADD COLUMN     "isAutomated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFlaky" BOOLEAN NOT NULL DEFAULT false;
