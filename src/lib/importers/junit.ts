import type { PrismaClient } from "@prisma/client";
import { importJUnit as implementation } from "./junit.js";

export type ImportOptions = {
  projectId: string;
  executionId: string;
  autoCreateCases?: boolean;
};

export const importJUnit = implementation as (
  xml: string,
  options: ImportOptions,
  client?: PrismaClient
) => Promise<void>;
