const { PrismaClient } = require("@prisma/client");

const DEFAULT_LOCAL_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/testsimplify";

const resolveDatabaseUrl = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL environment variable must be set in production");
  }

  if (process.env.NODE_ENV !== "test") {
    console.warn(
      "[prisma] DATABASE_URL is not set. Falling back to the default local Postgres connection string."
    );
  }

  return DEFAULT_LOCAL_DATABASE_URL;
};

let globalClient = globalThis.__testsimplify_prisma;

if (!globalClient) {
  const databaseUrl = resolveDatabaseUrl();
  globalClient = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__testsimplify_prisma = globalClient;
  }
}

module.exports = { prisma: globalClient, PrismaClient };
