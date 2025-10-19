import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
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
});

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const testCase = await prisma.testCase.findUnique({
      where: { id: params.id },
      include: { requirements: true },
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
    ...(parsed.name && { name: parsed.name }),
    ...(parsed.description && { description: parsed.description }),
    ...(parsed.preconditions && { preconditions: parsed.preconditions }),
    ...(parsed.steps && { steps: parsed.steps as unknown as Prisma.InputJsonValue }),
    ...(parsed.expected && { expected: parsed.expected }),
    ...(parsed.priority !== undefined && { priority: { set: parsed.priority } }),
    ...(parsed.status !== undefined && { status: parsed.status }), // status is a string in schema
    ...(parsed.tags && { tags: { set: parsed.tags } }),
    ...(parsed.component && { component: parsed.component }),
    ...(
      parsed.ownerId !== undefined
        ? (parsed.ownerId === null
          ? { owner: { disconnect: true } }
          : { owner: { connect: { id: parsed.ownerId } } })
        : {}
    ),
  };

  const testCase = await prisma.testCase.update({
    where: { id: params.id },
    data,
  });

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

  return NextResponse.json({ ok: true });
  }
);
