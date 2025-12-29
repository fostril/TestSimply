"use client";

import { useEffect } from "react";
import { useProjectStore } from "@/lib/stores/project-store";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

export default function ProjectLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: { id: string };
}) {
    const setProject = useProjectStore((state) => state.setProject);
    const router = useRouter();
    const pathname = usePathname();

    // Fetch project to ensure it exists and get ID/Key
    const { data: project } = useQuery({
        queryKey: ["project", params.id],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${params.id}`);
            if (!res.ok) throw new Error("Failed to load project");
            return res.json();
        },
    });

    useEffect(() => {
        if (project) {
            setProject({ id: project.id, key: project.key });

            // If the current URL uses the project ID, redirect to the project Key
            if (project.key && params.id !== project.key) {
                const newPath = pathname.replace(`/projects/${params.id}`, `/projects/${project.key}`);
                router.replace(newPath);
            }
        }
    }, [project, setProject, params.id, pathname, router]);

    return <>{children}</>;
}
