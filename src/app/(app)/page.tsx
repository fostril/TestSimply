"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/stores/project-store";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export default function RootPage() {
    const router = useRouter();
    const projectKey = useProjectStore((state) => state.projectKey);
    const projectId = useProjectStore((state) => state.projectId);

    const { data: session, status } = useSession();

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

        // If we have a stored key, try to use it
        if (projectKey) {
            router.replace(`/projects/${projectKey}`);
            return;
        }

        // Otherwise, if we have projects, use the first one's key
        if (projects && projects.length > 0) {
            const firstKey = projects[0].key;
            router.replace(`/projects/${firstKey}`);
            return;
        }

        // Fallback if no projects exist
        router.replace("/projects/new");
    }, [projectKey, projects, isProjectsLoading, router, status]);

    return (
        <div className="p-8">
            <LoadingSkeleton count={1} />
            <p className="mt-4 text-center text-slate-500">Redirecting to project...</p>
        </div>
    );
}
