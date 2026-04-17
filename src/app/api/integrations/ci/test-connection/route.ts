import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { GitHubCiClient } from "@/lib/ci";
import { prisma } from "@/lib/prisma";

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "settings:manage");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { projectId } = body as { projectId?: string };

    if (!projectId) {
        return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const access = await requireProjectAccessOrForbid(
        auth.session.user.id,
        auth.session.user.role,
        projectId,
    );
    if (access instanceof NextResponse) return access;

    // Get project settings
    const settings = await prisma.projectSetting.findUnique({
        where: { projectId },
    });

    if (!settings || !settings.ciProvider || !settings.ciUrl || !settings.ciToken) {
        return NextResponse.json({
            success: false,
            message: "CI is not configured. Please save your CI settings first."
        });
    }

    // Get CI Client and test connection
    const ciClient = await GitHubCiClient.forProject(projectId);
    if (!ciClient) {
        return NextResponse.json({
            success: false,
            message: "Failed to initialize CI client."
        });
    }

    const result = await ciClient.testConnection();
    return NextResponse.json(result);
});
