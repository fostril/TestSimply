import { PrismaClient, Role, Priority, TestStatus } from "@/lib/prisma-client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");
  const password = await bcrypt.hash("password", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@testsimplify.io" },
    update: {},
    create: {
      email: "admin@testsimplify.io",
      name: "Admin",
      password,
      role: Role.ADMIN
    }
  });

  for (let p = 1; p <= 3; p += 1) {
    const project = await prisma.project.create({
      data: {
        key: `PRJ-${p}`,
        name: `Project ${p}`,
        description: "Demo project",
        settings: {
          create: {
            tags: ["regression", "smoke", "accessibility"],
            components: ["web", "api", "mobile"],
            environments: ["staging", "production"],
            priorities: [Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.CRITICAL]
          }
        }
      }
    });

    const testCases = await Promise.all(
      Array.from({ length: 30 }).map((_, index) =>
        prisma.testCase.create({
          data: {
            projectId: project.id,
            key: `${project.key}-TC-${index + 1}`,
            name: `Sign in scenario ${index + 1}`,
            description: "As a user I can sign in",
            preconditions: "User exists",
            steps: [
              { action: "Open login page", expected: "Login form visible" },
              { action: "Fill in credentials", expected: "Form filled" },
              { action: "Submit", expected: "Dashboard displayed" }
            ],
            expected: "Dashboard should load",
            priority: Priority.MEDIUM,
            status: "READY",
            tags: ["regression", "login"],
            component: "web",
            ownerId: admin.id
          }
        })
      )
    );

    const plan = await prisma.testPlan.create({
      data: {
        projectId: project.id,
        key: `${project.key}-PLAN-1`,
        name: "Release validation",
        description: "Regression suite",
        environments: ["staging"],
        tags: ["release"],
        cases: {
          create: testCases.slice(0, 10).map((testCase) => ({ caseId: testCase.id }))
        }
      }
    });

    for (let e = 1; e <= 3; e += 1) {
      const execution = await prisma.testExecution.create({
        data: {
          projectId: project.id,
          planId: plan.id,
          key: `${project.key}-EXEC-${e}`,
          name: `Execution ${e}`,
          environment: e % 2 === 0 ? "staging" : "production",
          createdById: admin.id
        }
      });

      await prisma.testResult.createMany({
        data: testCases.slice(0, 10).map((testCase, index) => ({
          executionId: execution.id,
          caseId: testCase.id,
          status: index % 5 === 0 ? TestStatus.FAIL : TestStatus.PASS,
          durationMs: 30000,
          errorMessage: index % 5 === 0 ? "AssertionError: login failed" : null
        }))
      });
    }
  }

  console.log("✅ Seed complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
