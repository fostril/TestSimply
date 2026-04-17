/**
 * CLI utility to promote a user to the ADMIN role.
 *
 * Usage (from repo root):
 *   npx tsx scripts/promote-admin.ts <email>
 *
 * In Docker:
 *   docker compose exec app node ./scripts/promote-admin.js <email>
 *
 * Exits non-zero on error so it can be used from automation.
 */
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: promote-admin <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(2);
  }

  if (user.role === Role.ADMIN) {
    console.log(`${email} is already an ADMIN. No changes made.`);
    return;
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { role: Role.ADMIN, emailVerified: user.emailVerified ?? new Date() },
  });

  console.log(`Promoted ${updated.email} from ${user.role} to ADMIN.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(3);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
