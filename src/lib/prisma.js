const { PrismaClient } = require("./prisma-client.js");

const globalForPrisma = globalThis;

if (!globalForPrisma.__prisma) {
  globalForPrisma.__prisma = new PrismaClient();
}

const prisma = globalForPrisma.__prisma;

module.exports = { PrismaClient, prisma };
