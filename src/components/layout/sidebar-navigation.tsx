"use client";

import { useProjectStore } from "@/lib/stores/project-store";
import { NavLink } from "@/components/nav-link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

export function SidebarNavigation() {
    const projectKey = useProjectStore((state) => state.projectKey);
    const projectId = useProjectStore((state) => state.projectId);
    const { data: session } = useSession();
    const userRole = (session?.user as any)?.role;
    const isAdmin = userRole === "ADMIN";
    const isLead = userRole === "LEAD";

    // Fetch user's lead projects to check if they have access to current project's settings
    const { data: currentUser } = useQuery({
        queryKey: ["current-user-projects", session?.user?.email],
        queryFn: async () => {
            if (!isLead) return null;
            const res = await fetch("/api/users/me/projects");
            if (!res.ok) return null;
            return res.json();
        },
        enabled: isLead,
    });

    // Check if lead has access to current project
    const leadHasProjectAccess = isLead && currentUser?.leadProjects?.some(
        (p: { id: string; key: string }) => p.id === projectId || p.key === projectKey
    );

    const canAccessSettings = isAdmin || leadHasProjectAccess;

    const navItems = [
        { href: projectKey ? `/projects/${projectKey}` : "/", label: "Dashboard" },
        { href: projectKey ? `/projects/${projectKey}/testcases` : "/testcases", label: "Test Cases" },
        { href: projectKey ? `/projects/${projectKey}/testplans` : "/testplans", label: "Plans" },
        { href: projectKey ? `/projects/${projectKey}/test-sets` : "/test-sets", label: "Test Sets" },
        { href: projectKey ? `/projects/${projectKey}/preconditions` : "/preconditions", label: "Preconditions" },
        { href: projectKey ? `/projects/${projectKey}/environments` : "/environments", label: "Environments" },
        { href: projectKey ? `/projects/${projectKey}/executions` : "/executions", label: "Executions" },
        { href: projectKey ? `/projects/${projectKey}/bugs` : "/bugs", label: "Bugs" },
        { href: projectKey ? `/projects/${projectKey}/reports` : "/reports", label: "Reports" },
        ...(canAccessSettings && projectKey ? [{
            href: `/projects/${projectKey}/settings`,
            label: "Settings"
        }] : []),
        ...(isAdmin ? [{
            href: "/settings",
            label: "Admin"
        }] : [])
    ];

    return (
        <nav className="mt-8 space-y-2">
            {navItems.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} />
            ))}
        </nav>
    );
}
