"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/stores/project-store";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { usePermissions } from "@/lib/hooks/use-permissions";

export default function RootPage() {
    const router = useRouter();
    const projectKey = useProjectStore((state) => state.projectKey);
    const { can } = usePermissions();
    const canCreateProject = can("project:create");

    const { status } = useSession();

    const { data: projects, isLoading: isProjectsLoading } = useQuery({
        queryKey: ["projects"],
        queryFn: async () => {
            const res = await fetch("/api/projects");
            if (!res.ok) throw new Error("Failed to load projects");
            return res.json();
        },
        enabled: status === "authenticated",
    });

    useEffect(() => {
        if (status === "loading") return;

        if (status === "unauthenticated") {
            router.replace("/auth/login");
            return;
        }

        if (isProjectsLoading) return;

        // If we have a stored key that exists in accessible projects, use it
        if (projectKey && Array.isArray(projects) && projects.some((p: any) => p.key === projectKey)) {
            router.replace(`/projects/${projectKey}`);
            return;
        }

        // Otherwise, if we have projects, use the first one's key
        if (projects && projects.length > 0) {
            const firstKey = projects[0].key;
            router.replace(`/projects/${firstKey}`);
            return;
        }

        // Fallback if no projects exist and user is allowed to create one
        if (canCreateProject) {
            router.replace("/projects/new");
        }
    }, [projectKey, projects, isProjectsLoading, router, status, canCreateProject]);

    if (status === "authenticated" && !isProjectsLoading && Array.isArray(projects) && projects.length === 0 && !canCreateProject) {
        return (
            <div className="mx-auto max-w-lg px-6 py-16 text-center">
                <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
                    <h1 className="text-lg font-semibold text-slate-900">No Projects Assigned</h1>
                    <p className="mt-2 text-sm text-slate-600">
                        You haven&apos;t been added to any projects yet. Ask a Project Lead or Administrator to assign you to a project.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <LoadingSkeleton count={1} />
            <p className="mt-4 text-center text-slate-500">Redirecting to project...</p>
        </div>
    );
}
