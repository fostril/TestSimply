import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";

export const GET = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
        return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    const access = await requireProjectAccessOrForbid(
        auth.session.user.id,
        auth.session.user.role,
        projectId,
    );
    if (access instanceof NextResponse) return access;

    const [topTestCases, topTestSets] = await Promise.all([
        prisma.testCase.findMany({
            where: { projectId, bugs: { some: {} } }, // Only fetch if they have bugs
            select: {
                id: true,
                key: true,
                name: true,
                _count: {
                    select: { bugs: true }
                }
            },
            orderBy: {
                bugs: {
                    _count: 'desc'
                }
            },
            take: 10
        }),
        prisma.testSet.findMany({
            where: { projectId, bugs: { some: {} } }, // Only fetch if they have bugs
            select: {
                id: true,
                key: true,
                name: true,
                _count: {
                    select: { bugs: true }
                }
            },
            orderBy: {
                bugs: {
                    _count: 'desc'
                }
            },
            take: 10
        })
    ]);

    // Transform data to a cleaner format if needed, or send as is
    const formatData = (items: any[]) => items.map(item => ({
        id: item.id,
        key: item.key,
        name: item.name,
        bugCount: item._count.bugs
    }));

    return NextResponse.json({
        topTestCases: formatData(topTestCases),
        topTestSets: formatData(topTestSets)
    });
});
