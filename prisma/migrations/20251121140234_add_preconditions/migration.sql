/*
  Warnings:

  - You are about to drop the column `preconditions` on the `TestCase` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TestCase" DROP COLUMN "preconditions",
ADD COLUMN     "preconditionsText" TEXT;

-- CreateTable
CREATE TABLE "Precondition" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Precondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PreconditionToTestCase" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PreconditionToTestCase_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Precondition_projectId_key_key" ON "Precondition"("projectId", "key");

-- CreateIndex
CREATE INDEX "_PreconditionToTestCase_B_index" ON "_PreconditionToTestCase"("B");

-- AddForeignKey
ALTER TABLE "Precondition" ADD CONSTRAINT "Precondition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PreconditionToTestCase" ADD CONSTRAINT "_PreconditionToTestCase_A_fkey" FOREIGN KEY ("A") REFERENCES "Precondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PreconditionToTestCase" ADD CONSTRAINT "_PreconditionToTestCase_B_fkey" FOREIGN KEY ("B") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
