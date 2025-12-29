import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { Prisma, Priority } from "@prisma/client";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  steps: z.array(z.any()).optional(),          // stored as Json in Prisma
  expected: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(), // Prisma enum
  status: z.string().optional(),               // string field (no enum in client)
  tags: z.array(z.string()).optional(),        // scalar list
  component: z.string().optional(),
  ownerId: z.string().nullable().optional(),   // relation: connect/disconnect
  isAutomated: z.boolean().optional(),
  automationId: z.string().optional(),
  isFlaky: z.boolean().optional(),
});

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const testCase = await prisma.testCase.findUnique({
      where: { id: params.id },
      include: {
        requirements: true,
        preconditions: true,
        bugs: true
      },
    });

    if (!testCase) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(testCase);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:update");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const parsed = updateSchema.parse(body);

    const data: Prisma.TestCaseUpdateInput = {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.description !== undefined && { description: parsed.description }),
      ...(parsed.preconditions !== undefined && { preconditionsText: parsed.preconditions }), // Use preconditionsText
      ...(parsed.steps !== undefined && { steps: parsed.steps as unknown as Prisma.InputJsonValue }),
      ...(parsed.expected !== undefined && { expected: parsed.expected }),
      ...(parsed.priority !== undefined && { priority: { set: parsed.priority } }),
      ...(parsed.status !== undefined && { status: parsed.status }), // status is a string in schema
      ...(parsed.tags !== undefined && { tags: { set: parsed.tags } }),
      ...(parsed.component !== undefined && { component: parsed.component }),
      ...(
        parsed.ownerId !== undefined
          ? (parsed.ownerId === null
            ? { owner: { disconnect: true } }
            : { owner: { connect: { id: parsed.ownerId } } })
          : {}
      ),
      ...(parsed.isAutomated !== undefined && { isAutomated: parsed.isAutomated }),
      ...(parsed.automationId !== undefined && { automationId: parsed.automationId }),
      ...(parsed.isFlaky !== undefined && { isFlaky: parsed.isFlaky }),
    };

    const testCase = await prisma.testCase.update({
      where: { id: params.id },
      data,
    });

    await logAudit(auth.session.user?.id, "UPDATE", "TestCase", testCase.id, parsed);

    return NextResponse.json(testCase);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:delete");
    if (!auth.authorized) return auth.response;

    await prisma.testCase.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });

    await logAudit(auth.session.user?.id, "DELETE", "TestCase", params.id, {});

    return NextResponse.json({ ok: true });
  }
);
