import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { createCiClientForProject } from "@/lib/ci";
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
        where: { projectId: access.id },
    });

    if (!settings || !settings.ciProvider || !settings.ciUrl || !settings.ciToken) {
        return NextResponse.json({
            success: false,
            message: "CI is not configured. Please save your CI settings first."
        });
    }

    // Get CI Client and test connection
    let ciClient;
    try {
        ciClient = await createCiClientForProject(access.id);
    } catch (err) {
        return NextResponse.json({
            success: false,
            message: (err as Error).message,
        });
    }
    if (!ciClient) {
        return NextResponse.json({
            success: false,
            message: "Unsupported or incomplete CI provider configuration."
        });
    }

    const result = await ciClient.testConnection();
    return NextResponse.json(result);
});
