-- DropForeignKey
ALTER TABLE "PersonalAccessToken" DROP CONSTRAINT "PersonalAccessToken_userId_fkey";

-- AddForeignKey
ALTER TABLE "PersonalAccessToken" ADD CONSTRAINT "PersonalAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
