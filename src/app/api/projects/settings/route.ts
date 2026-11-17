import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { encrypt } from "@/lib/encryption";
import { assertSafeExternalUrl } from "@/lib/ssrf";

const updateSettingsSchema = z.object({
    projectId: z.string().min(1),
    jiraUrl: z.string().url().optional().or(z.literal("")),
    jiraEmail: z.string().email().optional().or(z.literal("")),
    jiraApiToken: z.string().optional().or(z.literal("")),
    jiraProjectKey: z.string().trim().max(50).optional().or(z.literal("")),
    ciProvider: z.string().optional().or(z.literal("")),
    ciUrl: z.string().url().optional().or(z.literal("")),
    ciToken: z.string().optional().or(z.literal("")),
    ciWorkflowId: z.string().optional().or(z.literal("")),
});

export const PATCH = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "project:update");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const parsed = updateSettingsSchema.parse(body);

    const access = await requireProjectAccessOrForbid(
        auth.session.user.id,
        auth.session.user.role,
        parsed.projectId,
    );
    if (access instanceof NextResponse) return access;

    // SSRF guard for user-provided integration URLs
    try {
        if (parsed.jiraUrl) await assertSafeExternalUrl(parsed.jiraUrl);
        if (parsed.ciUrl) await assertSafeExternalUrl(parsed.ciUrl);
    } catch (err) {
        return NextResponse.json(
            { error: "Invalid integration URL", message: (err as Error).message },
            { status: 400 },
        );
    }

    const isProd = process.env.NODE_ENV === "production";

    // In production, refuse to persist secrets unless ENCRYPTION_KEY is set.
    // Storing tokens unencrypted was the previous fallback, which effectively
    // leaked secrets to anyone with DB access.
    const encryptToken = (token: string | undefined): string | null => {
        if (!token) return null;
        try {
            return encrypt(token);
        } catch (err) {
            if (isProd) {
                throw new Error(
                    "ENCRYPTION_KEY is not configured - refusing to store integration secrets. " +
                    "Set ENCRYPTION_KEY before configuring integrations.",
                );
            }
            console.warn("[Settings] Encryption key not set, storing token unencrypted (dev only)", err);
            return token;
        }
    };

    const updateData: any = {};
    if (parsed.jiraUrl !== undefined) updateData.jiraUrl = parsed.jiraUrl || null;
    if (parsed.jiraEmail !== undefined) updateData.jiraEmail = parsed.jiraEmail || null;
    if (parsed.jiraApiToken !== undefined) updateData.jiraApiToken = encryptToken(parsed.jiraApiToken);
    if (parsed.jiraProjectKey !== undefined) updateData.jiraProjectKey = parsed.jiraProjectKey || null;
    if (parsed.ciProvider !== undefined) updateData.ciProvider = parsed.ciProvider || null;
    if (parsed.ciUrl !== undefined) updateData.ciUrl = parsed.ciUrl || null;
    if (parsed.ciToken !== undefined) updateData.ciToken = encryptToken(parsed.ciToken);
    if (parsed.ciWorkflowId !== undefined) updateData.ciWorkflowId = parsed.ciWorkflowId || null;

    const settings = await prisma.projectSetting.upsert({
        where: { projectId: parsed.projectId },
        create: {
            projectId: parsed.projectId,
            jiraUrl: parsed.jiraUrl || null,
            jiraEmail: parsed.jiraEmail || null,
            jiraApiToken: encryptToken(parsed.jiraApiToken),
            jiraProjectKey: parsed.jiraProjectKey || null,
            ciProvider: parsed.ciProvider || null,
            ciUrl: parsed.ciUrl || null,
            ciToken: encryptToken(parsed.ciToken),
            ciWorkflowId: parsed.ciWorkflowId || null,
        },
        update: updateData,
    });

    const sanitizedSettings = {
        ...settings,
        jiraApiToken: settings.jiraApiToken ? "********" : null,
        ciToken: settings.ciToken ? "********" : null,
    };

    await logAudit(auth.session.user?.id, "UPDATE", "ProjectSetting", settings.id, {
        projectId: parsed.projectId,
        jiraUrl: parsed.jiraUrl,
        ciUrl: parsed.ciUrl,
        // Never log token values
    });

    return NextResponse.json(sanitizedSettings);
});

