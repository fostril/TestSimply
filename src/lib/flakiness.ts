import { prisma } from "@/lib/prisma";

const FLAKY_WINDOW = 10;
const FLAKY_THRESHOLD = 2; // Number of flips to consider flaky

export async function checkAndMarkFlaky(caseId: string) {
    const results = await prisma.testResult.findMany({
        where: { caseId },
        orderBy: { createdAt: "desc" },
        take: FLAKY_WINDOW,
        select: { status: true },
    });

    if (results.length < 3) return;

    let flips = 0;
    let currentStatus = results[0].status;

    for (let i = 1; i < results.length; i++) {
        if (results[i].status !== currentStatus && results[i].status !== "SKIPPED") {
            flips++;
            currentStatus = results[i].status;
        }
    }

    if (flips >= FLAKY_THRESHOLD) {
        await prisma.testCase.update({
            where: { id: caseId },
            data: {
                isFlaky: true,
                flakyDetectedAt: new Date(),
            },
        });
    }
}
