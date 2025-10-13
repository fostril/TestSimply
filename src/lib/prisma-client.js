const createUnimplemented = (name) => {
  return async () => {
    throw new Error(`${name} is not implemented in the test environment.`);
  };
};

const createModel = (model) => ({
  findFirst: createUnimplemented(`${model}.findFirst`),
  findUnique: createUnimplemented(`${model}.findUnique`),
  create: createUnimplemented(`${model}.create`),
  update: createUnimplemented(`${model}.update`),
  delete: createUnimplemented(`${model}.delete`)
});

class PrismaClient {
  constructor() {
    this.user = createModel("user");
    this.project = createModel("project");
    this.testCase = createModel("testCase");
    this.testResult = createModel("testResult");
    this.testExecution = createModel("testExecution");
    this.testPlan = createModel("testPlan");
    this.personalAccessToken = createModel("personalAccessToken");
    this.requirementLink = createModel("requirementLink");
    this.attachment = createModel("attachment");
  }

  async $queryRaw() {
    throw new Error("$queryRaw is not implemented in the test environment.");
  }
}

const Prisma = {
  sql(strings, ...values) {
    let result = "";
    strings.forEach((chunk, index) => {
      result += chunk;
      if (index < values.length) {
        result += String(values[index]);
      }
    });
    return result;
  }
};

const Role = {
  ADMIN: "ADMIN",
  LEAD: "LEAD",
  TESTER: "TESTER",
  VIEWER: "VIEWER"
};

const TestStatus = {
  PASS: "PASS",
  FAIL: "FAIL",
  BLOCKED: "BLOCKED",
  SKIPPED: "SKIPPED"
};

const Priority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL"
};

module.exports = { PrismaClient, Prisma, Role, TestStatus, Priority };
