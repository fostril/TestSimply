import { PrismaClient } from "@prisma/client";
import { encrypt, isEncrypted } from "../src/lib/encryption";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error("ERROR: ENCRYPTION_KEY must be set before running reencrypt-secrets.");
    process.exit(1);
  }

  const settings = await prisma.projectSetting.findMany({
    select: { id: true, projectId: true, jiraApiToken: true, ciToken: true },
  });

  let updatedCount = 0;
  for (const row of settings) {
    const updates: { jiraApiToken?: string; ciToken?: string } = {};

    if (row.jiraApiToken && !isEncrypted(row.jiraApiToken)) {
      updates.jiraApiToken = encrypt(row.jiraApiToken);
    }
    if (row.ciToken && !isEncrypted(row.ciToken)) {
      updates.ciToken = encrypt(row.ciToken);
    }

    if (Object.keys(updates).length > 0) {
      await prisma.projectSetting.update({
        where: { id: row.id },
        data: updates,
      });
      updatedCount++;
    }
  }

  console.log(`Re-encrypted legacy plaintext secrets on ${updatedCount} project setting(s).`);
}

main()
  .catch((err) => {
    console.error("Failed to re-encrypt secrets:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
