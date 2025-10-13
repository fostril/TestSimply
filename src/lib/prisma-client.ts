import { Role, TestStatus, Priority } from "./prisma-constants";

type Unimplemented = (...args: any[]) => Promise<never>;

const createUnimplemented = (name: string): Unimplemented => {
  return async () => {
    throw new Error(`${name} is not implemented in the test environment.`);
  };
};

type ModelMethods = {
  findFirst: Unimplemented;
  findUnique: Unimplemented;
  create: Unimplemented;
  update: Unimplemented;
  delete: Unimplemented;
};

const createModel = (model: string): ModelMethods => ({
  findFirst: createUnimplemented(`${model}.findFirst`),
  findUnique: createUnimplemented(`${model}.findUnique`),
  create: createUnimplemented(`${model}.create`),
  update: createUnimplemented(`${model}.update`),
  delete: createUnimplemented(`${model}.delete`)
});

export class PrismaClient {
  user = createModel("user");
  project = createModel("project");
  testCase = createModel("testCase");
  testResult = createModel("testResult");
  testExecution = createModel("testExecution");
  testPlan = createModel("testPlan");
  personalAccessToken = createModel("personalAccessToken");
  requirementLink = createModel("requirementLink");
  attachment = createModel("attachment");

  async $queryRaw<T = unknown>(): Promise<T> {
    throw new Error("$queryRaw is not implemented in the test environment.");
  }
}

export const Prisma = {
  sql(strings: TemplateStringsArray, ...values: unknown[]) {
    let result = "";
    strings.forEach((chunk, index) => {
      result += chunk;
      if (index < values.length) {
        result += String(values[index]);
      }
    });
    return result;
  }
} as const;

export type { Role, TestStatus, Priority };
