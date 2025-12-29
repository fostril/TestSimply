import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
    externalUrl: z.string().url(),
    type: z.string().min(1),
});

export const POST = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testcase:edit");
        if (!auth.authorized) return auth.response;

        const parsed = createSchema.parse(await req.json());

        const testCase = await prisma.testCase.findUniqueOrThrow({ where: { id: params.id } });

        const link = await prisma.requirementLink.create({
            data: {
                testCaseId: params.id,
                projectId: testCase.projectId,
                externalUrl: parsed.externalUrl,
                type: parsed.type,
            },
        });

        return NextResponse.json(link, { status: 201 });
    }
);

export const DELETE = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testcase:edit");
        if (!auth.authorized) return auth.response;

        const { searchParams } = new URL(req.url);
        const linkId = searchParams.get("linkId");

        if (!linkId) {
            return NextResponse.json({ error: "Missing linkId" }, { status: 400 });
        }

        // Verify the link belongs to the test case
        const link = await prisma.requirementLink.findUnique({
            where: { id: linkId },
        });

        if (!link || link.testCaseId !== params.id) {
            return NextResponse.json({ error: "Link not found" }, { status: 404 });
        }

        await prisma.requirementLink.delete({
            where: { id: linkId },
        });

        return NextResponse.json({ ok: true });
    }
);
