import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";
import { encrypt } from "@/lib/encryption";

const updateSettingsSchema = z.object({
    projectId: z.string().min(1),
    jiraUrl: z.string().url().optional().or(z.literal("")),
    jiraEmail: z.string().email().optional().or(z.literal("")),
    jiraApiToken: z.string().optional().or(z.literal("")),
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

    // Encrypt sensitive tokens before storing
    const encryptToken = (token: string | undefined): string | null => {
        if (!token) return null;
        try {
            return encrypt(token);
        } catch {
            // If encryption fails (no key), store as-is for backward compatibility
            console.warn("[Settings] Encryption key not set, storing token unencrypted");
            return token;
        }
    };

    const updateData: any = {};
    if (parsed.jiraUrl !== undefined) updateData.jiraUrl = parsed.jiraUrl || null;
    if (parsed.jiraEmail !== undefined) updateData.jiraEmail = parsed.jiraEmail || null;
    if (parsed.jiraApiToken !== undefined) updateData.jiraApiToken = encryptToken(parsed.jiraApiToken);
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
            ciProvider: parsed.ciProvider || null,
            ciUrl: parsed.ciUrl || null,
            ciToken: encryptToken(parsed.ciToken),
            ciWorkflowId: parsed.ciWorkflowId || null,
        },
        update: updateData,
    });

    // Mask sensitive data before returning
    const sanitizedSettings = {
        ...settings,
        jiraApiToken: settings.jiraApiToken ? "********" : null,
        ciToken: settings.ciToken ? "********" : null,
    };

    return NextResponse.json(sanitizedSettings);
});

