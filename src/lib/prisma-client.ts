export type Role = "ADMIN" | "LEAD" | "TESTER" | "VIEWER";
export type TestStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type PrismaJson = unknown;

export type PrismaWhere<T> = Partial<{ [K in keyof T]: T[K] }> & {
  OR?: PrismaWhere<T>[];
  AND?: PrismaWhere<T>[];
};

export type PrismaCreateArgs<T> = { data: T };
export type PrismaUpdateArgs<T> = { where: PrismaWhere<T>; data: Partial<T> };
export type PrismaDeleteArgs<T> = { where: PrismaWhere<T> };
export type PrismaFindArgs<T> = { where?: PrismaWhere<T> };

export type ModelDelegate<T> = {
  findFirst(args?: PrismaFindArgs<T>): Promise<T | null>;
  findUnique(args?: PrismaFindArgs<T>): Promise<T | null>;
  findMany(args?: PrismaFindArgs<T>): Promise<T[]>;
  create(args: PrismaCreateArgs<T>): Promise<T>;
  createMany(args: { data: T[] }): Promise<{ count: number }>;
  update(args: PrismaUpdateArgs<T>): Promise<T>;
  delete(args: PrismaDeleteArgs<T>): Promise<T>;
};

export type User = {
  id: string;
  email: string;
  name: string;
  password?: string;
  role: Role;
};

export type Project = {
  id: string;
  key: string;
  name: string;
  description?: string;
};

export type TestCase = {
  id: string;
  projectId: string;
  key: string;
  name: string;
  steps: PrismaJson;
};

export type TestExecution = {
  id: string;
  projectId: string;
  planId?: string;
  key: string;
  name: string;
  environment?: string;
};

export type TestResult = {
  id: string;
  executionId: string;
  caseId: string;
  status: TestStatus;
  durationMs?: number | null;
  errorMessage?: string | null;
  stepsLog?: PrismaJson;
};

export type PersonalAccessToken = {
  id: string;
  userId: string;
  tokenHash: string;
  label: string;
  scopes: string[];
  expiresAt?: string | null;
};

export type RequirementLink = {
  id: string;
  projectId: string;
  testCaseId: string;
  externalUrl: string;
  type: string;
};

export type Attachment = {
  id: string;
  url: string;
  fileName: string;
  executionId?: string;
  caseId?: string;
};

export type Account = {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
};

export type Session = {
  id: string;
  sessionToken: string;
  userId: string;
  expires: string;
};

export type VerificationToken = {
  id: string;
  identifier: string;
  token: string;
  expires: string;
};

export class PrismaClient {
  user: ModelDelegate<User>;
  project: ModelDelegate<Project>;
  testCase: ModelDelegate<TestCase>;
  testResult: ModelDelegate<TestResult>;
  testExecution: ModelDelegate<TestExecution>;
  testPlan: ModelDelegate<Record<string, unknown>>;
  personalAccessToken: ModelDelegate<PersonalAccessToken>;
  requirementLink: ModelDelegate<RequirementLink>;
  attachment: ModelDelegate<Attachment>;
  account: ModelDelegate<Account>;
  session: ModelDelegate<Session>;
  verificationToken: ModelDelegate<VerificationToken>;

  constructor();
  $disconnect(): Promise<void>;
  $queryRaw(): Promise<never>;
}

export const Prisma: {
  sql(strings: TemplateStringsArray, ...values: unknown[]): string;
};

export { PrismaClient as default };
