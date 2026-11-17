import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";
import { z } from "zod";

const linkSchema = z.object({
    preconditionId: z.string().min(1),
});

async function resolveTestCaseAndPrecondition(testCaseIdOrKey: string, preconditionId: string) {
    const testCase = await resolveByIdOrKey(
        async (id) => {
            const tc = await prisma.testCase.findUnique({ where: { id } });
            return tc && !tc.deletedAt ? tc : null;
        },
        async (projectId, key) => {
            const tc = await prisma.testCase.findUnique({ where: { projectId_key: { projectId, key } } });
            return tc && !tc.deletedAt ? tc : null;
        },
        testCaseIdOrKey,
    );
    if (!testCase) return { testCase: null, precondition: null };
    const precondition = await prisma.precondition.findUnique({ where: { id: preconditionId } });
    return { testCase, precondition };
}

export const POST = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testcase:update");
        if (!auth.authorized) return auth.response;

        const body = await req.json();
        const parsed = linkSchema.parse(body);

        const { testCase, precondition } = await resolveTestCaseAndPrecondition(params.id, parsed.preconditionId);
        const denied = await assertProjectAccessForResource(
            auth.session.user.id,
            auth.session.user.role,
            testCase,
        );
        if (denied) return denied;

        if (!precondition || precondition.projectId !== testCase!.projectId) {
            return NextResponse.json({ error: "Precondition not found" }, { status: 404 });
        }

        const updated = await prisma.testCase.update({
            where: { id: testCase!.id },
            data: { preconditions: { connect: { id: precondition.id } } },
            include: { preconditions: true },
        });

        return NextResponse.json(updated);
    }
);

export const DELETE = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testcase:update");
        if (!auth.authorized) return auth.response;

        const body = await req.json();
        const parsed = linkSchema.parse(body);

        const { testCase, precondition } = await resolveTestCaseAndPrecondition(params.id, parsed.preconditionId);
        const denied = await assertProjectAccessForResource(
            auth.session.user.id,
            auth.session.user.role,
            testCase,
        );
        if (denied) return denied;

        if (!precondition || precondition.projectId !== testCase!.projectId) {
            return NextResponse.json({ error: "Precondition not found" }, { status: 404 });
        }

        const updated = await prisma.testCase.update({
            where: { id: testCase!.id },
            data: { preconditions: { disconnect: { id: precondition.id } } },
            include: { preconditions: true },
        });

        return NextResponse.json(updated);
    }
);
