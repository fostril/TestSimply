import { prisma } from "@/lib/prisma";

export async function logAudit(
    userId: string | undefined,
    action: string,
    entity: string,
    entityId: string,
    payload: any
) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: userId || null,
                action,
                entity,
                entityId,
                payload: payload || {},
            },
        });
    } catch (error) {
        console.error("Failed to create audit log:", error);
        // We don't want to fail the main operation if logging fails, so we just log the error.
    }
}
