const test = require("node:test");
const assert = require("node:assert/strict");

const { importJUnit } = require("../src/lib/importers/junit.js");
const { importCucumber } = require("../src/lib/importers/cucumber.js");
const { TestStatus } = require("../src/lib/prisma-client.js");

const createPrismaMock = () => {
  const calls = {
    testCase: { findFirst: [], create: [] },
    testResult: { create: [] }
  };

  const mock = {
    testCase: {
      findFirst: async (args) => {
        calls.testCase.findFirst.push(args);
        return null;
      },
      create: async (args) => {
        calls.testCase.create.push(args);
        return { id: "case", ...args.data };
      }
    },
    testResult: {
      create: async (args) => {
        calls.testResult.create.push(args);
        return args;
      }
    }
  };

  return { mock, calls };
};

test("parses junit report", async () => {
  const { mock, calls } = createPrismaMock();
  mock.testCase.findFirst = async () => ({ id: "case", projectId: "proj" });
  const xml = `<?xml version="1.0"?><testsuite name="suite"><testcase name="TC-1" time="1" /></testsuite>`;
  await importJUnit(xml, { projectId: "proj", executionId: "exec" }, mock);
  assert.equal(calls.testResult.create.length, 1);
  assert.equal(calls.testResult.create[0].data.status, TestStatus.PASS);
});

test("parses cucumber report", async () => {
  const { mock, calls } = createPrismaMock();
  mock.testCase.findFirst = async () => ({ id: "case", projectId: "proj" });
  await importCucumber(
    [
      {
        name: "Login",
        elements: [
          {
            name: "TC-1",
            steps: [
              { name: "Given", result: { status: "passed" } },
              { name: "When", result: { status: "failed", error_message: "boom" } }
            ]
          }
        ]
      }
    ],
    { projectId: "proj", executionId: "exec" },
    mock
  );
  assert.equal(calls.testResult.create.length, 1);
  assert.equal(calls.testResult.create[0].data.status, TestStatus.FAIL);
});
