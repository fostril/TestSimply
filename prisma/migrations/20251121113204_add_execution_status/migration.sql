-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'BLOCKED');

-- AlterTable
ALTER TABLE "TestExecution" ADD COLUMN     "status" "ExecutionStatus" NOT NULL DEFAULT 'ACTIVE';
