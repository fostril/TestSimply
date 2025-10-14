import { PrismaClient, Role, Priority, TestStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function createUsers() {
  const users = [
    { name: "Ada Admin", email: "ada.admin@testsimplify.local", role: Role.ADMIN },
    { name: "Liam Lead", email: "liam.lead@testsimplify.local", role: Role.LEAD },
    { name: "Tara Tester", email: "tara.tester@testsimplify.local", role: Role.TESTER },
    { name: "Vera Viewer", email: "vera.viewer@testsimplify.local", role: Role.VIEWER }
  ];

  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);

  return Promise.all(
    users.map((user) =>
      prisma.user.upsert({
        where: { email: user.email },
        update: {},
        create: {
          ...user,
          password: passwordHash
        }
      })
    )
  );
}

async function createProjects() {
  return Promise.all(
    [
      {
        key: "ALPHA",
        name: "Alpha Platform",
        description: "Core platform used by internal teams"
      },
      {
        key: "BETA",
        name: "Beta Mobile",
        description: "Customer facing mobile application"
      },
      {
        key: "GAMMA",
        name: "Gamma Services",
        description: "Shared services for integrations"
      }
    ].map((project) =>
      prisma.project.upsert({
        where: { key: project.key },
        update: {},
        create: {
          ...project,
          settings: {
            create: {
              tags: ["regression", "smoke", "accessibility"],
              components: ["web", "api", "mobile"],
              environments: ["development", "staging", "production"],
              priorities: [Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.CRITICAL]
            }
          }
        }
      })
    )
  );
}

async function createTestCases(projectId: string, ownerId: string) {
  const baseSteps = [
    { action: "Navigate to login page", expected: "Login form is visible" },
    { action: "Enter valid credentials", expected: "Dashboard loads" },
    { action: "Click logout", expected: "User is signed out" }
  ];

  const priorities = [Priority.HIGH, Priority.MEDIUM, Priority.MEDIUM, Priority.LOW, Priority.CRITICAL];

  const promises = Array.from({ length: 20 }).map((_, index) =>
    prisma.testCase.create({
      data: {
        projectId,
        key: `${projectId.slice(0, 4).toUpperCase()}-TC-${index + 1}`,
        name: `End-to-end scenario ${index + 1}`,
        description: `End-to-end scenario ${index + 1} description`,
        preconditions: "User exists and environment is seeded",
        steps: baseSteps,
        expected: "Scenario completes successfully",
        priority: priorities[index % priorities.length],
        status: index % 3 === 0 ? "APPROVED" : "DRAFT",
        tags: index % 2 === 0 ? ["regression"] : ["smoke"],
        component: index % 2 === 0 ? "web" : "api",
        ownerId
      }
    })
  );

  return Promise.all(promises);
}

async function createPlan(projectId: string, key: string, name: string, caseIds: string[]) {
  return prisma.testPlan.create({
    data: {
      projectId,
      key,
      name,
      description: `${name} covering regression scenarios`,
      targetVersions: ["1.0.0", "1.1.0"],
      environments: ["staging", "production"],
      tags: ["release"],
      cases: {
        create: caseIds.slice(0, 10).map((id) => ({ caseId: id }))
      }
    }
  });
}

async function createExecution(projectId: string, planId: string, key: string, name: string, createdById: string) {
  return prisma.testExecution.create({
    data: {
      projectId,
      planId,
      key,
      name,
      description: `${name} for release candidate`,
      environment: "staging",
      revision: "1.1.0-rc1",
      buildUrl: "https://ci.local/jobs/123", 
      commitSha: "abcdef1234567890",
      labels: ["nightly", "ui"],
      startedAt: new Date(Date.now() - 1000 * 60 * 60),
      finishedAt: new Date(),
      createdById
    }
  });
}

async function createResults(executionId: string, testCaseIds: string[]) {
  return Promise.all(
    testCaseIds.slice(0, 10).map((caseId, index) =>
      prisma.testResult.create({
        data: {
          executionId,
          caseId,
          status: index % 5 === 0 ? TestStatus.FAIL : TestStatus.PASS,
          durationMs: 5000 + index * 1000,
          evidenceURLs: index % 5 === 0 ? ["https://storage.local/failure.png"] : [],
          errorMessage: index % 5 === 0 ? "AssertionError: expected status 200 but got 500" : null,
          stepsLog: [
            {
              name: "Execute step",
              status: index % 5 === 0 ? "FAIL" : "PASS",
              notes: index % 5 === 0 ? "Button not clickable" : ""
            }
          ],
          retried: index % 7 === 0,
          attempt: index % 7 === 0 ? 2 : 1
        }
      })
    )
  );
}

async function main() {
  console.log("🌱 Starting TestSimply seed...");
  await prisma.attachment.deleteMany();
  await prisma.testResult.deleteMany();
  await prisma.testExecution.deleteMany();
  await prisma.testCasePlan.deleteMany();
  await prisma.testPlan.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.requirementLink.deleteMany();
  await prisma.projectSetting.deleteMany();
  await prisma.project.deleteMany();
  await prisma.personalAccessToken.deleteMany();
  await prisma.account.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();

  const users = await createUsers();
  const projects = await createProjects();

  for (const project of projects) {
    const owner = users[0];
    const cases = await createTestCases(project.id, owner.id);
    const plan = await createPlan(project.id, `${project.key}-PLAN-1`, `${project.name} Regression`, cases.map((c) => c.id));
    const execution = await createExecution(
      project.id,
      plan.id,
      `${project.key}-EXEC-1`,
      `${project.name} Regression Run`,
      users[1].id
    );
    await createResults(execution.id, cases.map((testCase) => testCase.id));
  }

  console.log("✅ Seed data generated");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
