import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

export const FLAKY_WINDOW = 10;
export const FLAKY_THRESHOLD = 2; // Number of status flips in the last 10 non-skipped runs

export interface FlakinessAnalysis {
    isFlaky: boolean;
    flips: number;
    runCount: number;
    passCount: number;
    failCount: number;
    blockedCount: number;
    failRate: number;
}

/**
 * Pure flakiness analysis over an array of result statuses (most recent first).
 * Ignores SKIPPED rows and considers up to `FLAKY_WINDOW` (10) non-skipped runs.
 */
export function analyzeFlakiness(statuses: string[]): FlakinessAnalysis {
    const nonSkipped = statuses
        .filter((s) => s && s !== "SKIPPED")
        .slice(0, FLAKY_WINDOW);

    const runCount = nonSkipped.length;
    const passCount = nonSkipped.filter((s) => s === "PASS").length;
    const failCount = nonSkipped.filter((s) => s === "FAIL").length;
    const blockedCount = nonSkipped.filter((s) => s === "BLOCKED").length;
    const failRate = runCount === 0 ? 0 : Math.round((failCount / runCount) * 100);

    if (runCount < 3) {
        return {
            isFlaky: false,
            flips: 0,
            runCount,
            passCount,
            failCount,
            blockedCount,
            failRate,
        };
    }

    let flips = 0;
    let currentStatus = nonSkipped[0];
    for (let i = 1; i < nonSkipped.length; i++) {
        if (nonSkipped[i] !== currentStatus) {
            flips++;
            currentStatus = nonSkipped[i];
        }
    }

    return {
        isFlaky: flips >= FLAKY_THRESHOLD,
        flips,
        runCount,
        passCount,
        failCount,
        blockedCount,
        failRate,
    };
}

export async function checkAndMarkFlaky(
    caseId: string,
    client: PrismaClient = defaultPrisma,
) {
    // Fetch extra rows so placeholder SKIPPED records don't push real runs out
    // of the 10-run window.
    const results = await client.testResult.findMany({
        where: { caseId },
        orderBy: { createdAt: "desc" },
        take: FLAKY_WINDOW * 3,
        select: { status: true },
    });

    const analysis = analyzeFlakiness(results.map((r) => r.status));

    if (analysis.isFlaky) {
        await client.testCase.update({
            where: { id: caseId },
            data: {
                isFlaky: true,
                flakyDetectedAt: new Date(),
            },
        });
        return;
    }

    // Self-heal: if a previously flaky test has stabilized (< 2 flips across its
    // recent window, or results were cleared), clear the flaky flag automatically.
    const findCase =
        typeof client.testCase.findUnique === "function"
            ? () => client.testCase.findUnique({ where: { id: caseId }, select: { isFlaky: true } })
            : typeof client.testCase.findFirst === "function"
              ? () => client.testCase.findFirst({ where: { id: caseId }, select: { isFlaky: true } })
              : null;

    if (findCase) {
        const currentCase = await findCase();
        if (currentCase?.isFlaky) {
            await client.testCase.update({
                where: { id: caseId },
                data: {
                    isFlaky: false,
                    flakyDetectedAt: null,
                },
            });
        }
    }
}
