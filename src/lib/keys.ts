import { PrismaClient } from "@prisma/client";

export async function generateEntityKey(
    prisma: PrismaClient,
    projectId: string,
    projectKey: string,
    type: "TC" | "TSET" | "PLAN" | "PRECON" | "ENV" | "EXEC" | "BUG"
): Promise<string> {
    const counter = await prisma.projectCounter.upsert({
        where: {
            projectId_type: {
                projectId,
                type,
            },
        },
        update: {
            count: {
                increment: 1,
            },
        },
        create: {
            projectId,
            type,
            count: 1,
        },
    });

    return `${projectKey}_${type}_${counter.count}`;
}
