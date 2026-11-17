import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccess } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { Priority, Role } from "@prisma/client";

const bulkUpdateSchema = z.object({
    ids: z.array(z.string()),
    action: z.enum(["update", "delete"]),
    data: z
        .object({
            status: z.string().optional(),
            priority: z.nativeEnum(Priority).optional(),
        })
        .optional(),
});

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "testcase:update");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const parsed = bulkUpdateSchema.parse(body);
    const { ids, action, data } = parsed;

    if (ids.length === 0) {
        return NextResponse.json({ count: 0 });
    }

    // Restrict to test cases the user can access. For ADMIN we skip the check
    // (fast path); for everyone else we load the owning projects and keep
    // only IDs belonging to projects they're a member/lead of.
    const cases = await prisma.testCase.findMany({
        where: { id: { in: ids } },
        select: { id: true, projectId: true },
    });

    let allowedCases = cases;
    if (auth.session.user.role !== Role.ADMIN) {
        const uniqueProjects = Array.from(new Set(cases.map((c) => c.projectId)));
        const allowedProjects = new Set<string>();
        for (const pid of uniqueProjects) {
            const access = await requireProjectAccess(
                auth.session.user.id,
                auth.session.user.role,
                pid,
            );
            if (access) allowedProjects.add(pid);
        }
        allowedCases = cases.filter((c) => allowedProjects.has(c.projectId));
    }
    const allowedIds = allowedCases.map((c) => c.id);
    const bulkProjectId =
        new Set(allowedCases.map((c) => c.projectId)).size === 1
            ? allowedCases[0]?.projectId ?? null
            : null;

    if (allowedIds.length === 0) {
        return NextResponse.json({ error: "No accessible test cases" }, { status: 403 });
    }

    if (action === "delete") {
        const result = await prisma.testCase.updateMany({
            where: { id: { in: allowedIds } },
            data: { deletedAt: new Date() },
        });
        await logAudit(auth.session.user?.id, "BULK_DELETE", "TestCase", "bulk", {
            count: result.count,
            ids: allowedIds,
        }, bulkProjectId);
        return NextResponse.json(result);
    }

    if (action === "update" && data) {
        const result = await prisma.testCase.updateMany({
            where: { id: { in: allowedIds } },
            data: {
                ...(data.status ? { status: data.status } : {}),
                ...(data.priority ? { priority: data.priority } : {}),
            },
        });
        await logAudit(auth.session.user?.id, "BULK_UPDATE", "TestCase", "bulk", {
            count: result.count,
            ids: allowedIds,
            data,
        }, bulkProjectId);
        return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action or missing data" }, { status: 400 });
});
