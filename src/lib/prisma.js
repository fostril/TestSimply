const { PrismaClient } = require("@prisma/client");

let globalClient = globalThis.__testsimplify_prisma;

if (!globalClient) {
  globalClient = new PrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalThis.__testsimplify_prisma = globalClient;
  }
}

module.exports = { prisma: globalClient, PrismaClient };
