-- CreateTable
CREATE TABLE "TestSet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TestCaseToTestSet" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TestCaseToTestSet_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestSet_projectId_key_key" ON "TestSet"("projectId", "key");

-- CreateIndex
CREATE INDEX "_TestCaseToTestSet_B_index" ON "_TestCaseToTestSet"("B");

-- AddForeignKey
ALTER TABLE "TestSet" ADD CONSTRAINT "TestSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TestCaseToTestSet" ADD CONSTRAINT "_TestCaseToTestSet_A_fkey" FOREIGN KEY ("A") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TestCaseToTestSet" ADD CONSTRAINT "_TestCaseToTestSet_B_fkey" FOREIGN KEY ("B") REFERENCES "TestSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
