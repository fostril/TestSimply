import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

const FLAKY_WINDOW = 10;
const FLAKY_THRESHOLD = 2; // Number of flips to consider flaky

export async function checkAndMarkFlaky(
    caseId: string,
    client: PrismaClient = defaultPrisma,
) {
    const results = await client.testResult.findMany({
        where: { caseId },
        orderBy: { createdAt: "desc" },
        take: FLAKY_WINDOW,
        select: { status: true },
    });

    if (results.length < 3) return;

    const nonSkipped = results.filter((r) => r.status !== "SKIPPED");
    if (nonSkipped.length < 3) return;

    let flips = 0;
    let currentStatus = nonSkipped[0].status;

    for (let i = 1; i < nonSkipped.length; i++) {
        if (nonSkipped[i].status !== currentStatus) {
            flips++;
            currentStatus = nonSkipped[i].status;
        }
    }

    if (flips >= FLAKY_THRESHOLD) {
        await client.testCase.update({
            where: { id: caseId },
            data: {
                isFlaky: true,
                flakyDetectedAt: new Date(),
            },
        });
    }
}
