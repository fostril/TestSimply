import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource } from "@/lib/api";
import { z } from "zod";

// A link can point at either:
//  - a pre-existing Requirement (by id), OR
//  - a legacy externalUrl (will be preserved on the link)
// Exactly one of `requirementId` or `externalUrl` must be provided.
const createSchema = z
  .object({
    requirementId: z.string().optional(),
    externalUrl: z.string().url().optional(),
    type: z.string().min(1).default("covers"),
  })
  .refine(
    (v) => Boolean(v.requirementId) !== Boolean(v.externalUrl),
    { message: "Provide exactly one of requirementId or externalUrl" },
  );

export const POST = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:update");
    if (!auth.authorized) return auth.response;

    const testCase = await prisma.testCase.findUnique({ where: { id: params.id } });
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      testCase,
    );
    if (denied) return denied;

    const parsed = createSchema.parse(await req.json());

    // If a requirementId is supplied, it must belong to the same project.
    if (parsed.requirementId) {
      const req = await prisma.requirement.findUnique({
        where: { id: parsed.requirementId },
        select: { projectId: true },
      });
      if (!req || req.projectId !== testCase!.projectId) {
        return NextResponse.json({ error: "Invalid requirementId" }, { status: 400 });
      }

      // Enforce uniqueness at the app layer too; the DB unique index
      // (requirementId, testCaseId) would reject otherwise.
      const existing = await prisma.requirementLink.findFirst({
        where: {
          testCaseId: testCase!.id,
          requirementId: parsed.requirementId,
        },
      });
      if (existing) {
        return NextResponse.json(existing, { status: 200 });
      }
    }

    const link = await prisma.requirementLink.create({
      data: {
        testCaseId: testCase!.id,
        projectId: testCase!.projectId,
        requirementId: parsed.requirementId || null,
        externalUrl: parsed.externalUrl || null,
        type: parsed.type,
      },
    });

    return NextResponse.json(link, { status: 201 });
  },
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:update");
    if (!auth.authorized) return auth.response;

    const testCase = await prisma.testCase.findUnique({ where: { id: params.id } });
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      testCase,
    );
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const linkId = searchParams.get("linkId");

    if (!linkId) {
      return NextResponse.json({ error: "Missing linkId" }, { status: 400 });
    }

    const link = await prisma.requirementLink.findUnique({ where: { id: linkId } });
    if (!link || link.testCaseId !== testCase!.id) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    await prisma.requirementLink.delete({ where: { id: linkId } });

    return NextResponse.json({ ok: true });
  },
);
