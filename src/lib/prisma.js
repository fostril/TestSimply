// CJS compatibility wrapper — reuses the same global singleton as prisma.ts
// This file exists solely for the CJS importers (junit.js, cucumber.js).
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

// Use the same global key as prisma.ts to avoid duplicate clients
const globalForPrisma = globalThis;

if (!globalForPrisma.prisma) {
  const databaseUrl = resolveDatabaseUrl();
  globalForPrisma.prisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
}

const prisma = globalForPrisma.prisma;

module.exports = { prisma, PrismaClient };
