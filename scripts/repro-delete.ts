import { prisma } from "../src/lib/prisma";

async function main() {
    console.log("Creating project...");
    const project = await prisma.project.create({
        data: {
            key: "REPRO",
            name: "Repro Project",
            description: "To test deletion",
            settings: {
                create: {}
            }
        }
    });
    console.log("Project created:", project.id);

    console.log("Creating test case...");
    await prisma.testCase.create({
        data: {
            projectId: project.id,
            key: "TC-1",
            name: "Test Case 1",
            steps: [],
            status: "Draft"
        }
    });

    console.log("Deleting project...");
    try {
        await prisma.project.delete({
            where: { id: project.id }
        });
        console.log("Project deleted successfully");
    } catch (e) {
        console.error("Failed to delete project:", e);
    }
}

main();
