// CJS compatibility wrapper — mirrors keys.ts for the CJS importers
// (junit.js, cucumber.js). Uses the same atomic ProjectCounter logic.

async function generateEntityKey(prisma, projectId, projectKey, type) {
  const counter = await prisma.projectCounter.upsert({
    where: {
      projectId_type: {
        projectId,
        type,
      },
    },
    update: {
      count: { increment: 1 },
    },
    create: {
      projectId,
      type,
      count: 1,
    },
  });

  return `${projectKey}_${type}_${counter.count}`;
}

module.exports = { generateEntityKey };
