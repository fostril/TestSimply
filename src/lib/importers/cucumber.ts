import type { PrismaClient } from "@prisma/client";
import { importCucumber as implementation } from "./cucumber.js";

export type ImportOptions = {
  projectId: string;
  executionId: string;
  autoCreateCases?: boolean;
};

export const importCucumber = implementation as (
  json: unknown[],
  options: ImportOptions,
  client?: PrismaClient
) => Promise<void>;
