import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";
import { Priority } from "@prisma/client";

const bulkUpdateSchema = z.object({
    ids: z.array(z.string()),
    action: z.enum(["update", "delete"]),
    data: z.object({
        status: z.string().optional(),
        priority: z.nativeEnum(Priority).optional(),
    }).optional(),
});

export const POST = withApiHandler(async (req: NextRequest) => {
    // Using POST for bulk actions to avoid body limitations in DELETE (though usually fine) 
    // and to have a single endpoint for multiple actions.
    // Alternatively could use PATCH and DELETE separately.
    // Let's stick to POST as a "command" endpoint or use PATCH/DELETE.
    // The plan said "New endpoint for bulk updates".

    const auth = await requireAuth(req, "testcase:edit");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const parsed = bulkUpdateSchema.parse(body);
    const { ids, action, data } = parsed;

    if (ids.length === 0) {
        return NextResponse.json({ count: 0 });
    }

    if (action === "delete") {
        // Soft delete
        const result = await prisma.testCase.updateMany({
            where: { id: { in: ids } },
            data: { deletedAt: new Date() },
        });
        return NextResponse.json(result);
    }

    if (action === "update" && data) {
        const result = await prisma.testCase.updateMany({
            where: { id: { in: ids } },
            data: {
                ...(data.status ? { status: data.status } : {}),
                ...(data.priority ? { priority: data.priority } : {}),
            },
        });
        return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action or missing data" }, { status: 400 });
});
