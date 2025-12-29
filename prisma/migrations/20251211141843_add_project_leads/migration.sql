-- CreateTable
CREATE TABLE "_ProjectLeads" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProjectLeads_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ProjectLeads_B_index" ON "_ProjectLeads"("B");

-- AddForeignKey
ALTER TABLE "_ProjectLeads" ADD CONSTRAINT "_ProjectLeads_A_fkey" FOREIGN KEY ("A") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProjectLeads" ADD CONSTRAINT "_ProjectLeads_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
