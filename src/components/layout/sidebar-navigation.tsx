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

    // Project-scoped links are only meaningful when a project is active. When
    // no project is selected we only show Dashboard and (for admins) Admin —
    // there are no top-level routes like /testcases or /testplans.
    const projectScoped = projectKey
        ? [
              { href: `/projects/${projectKey}/testcases`, label: "Test Cases" },
              { href: `/projects/${projectKey}/testplans`, label: "Plans" },
              { href: `/projects/${projectKey}/test-sets`, label: "Test Sets" },
              { href: `/projects/${projectKey}/preconditions`, label: "Preconditions" },
              { href: `/projects/${projectKey}/requirements`, label: "Requirements" },
              { href: `/projects/${projectKey}/environments`, label: "Environments" },
              { href: `/projects/${projectKey}/executions`, label: "Executions" },
              { href: `/projects/${projectKey}/bugs`, label: "Bugs" },
              { href: `/projects/${projectKey}/reports`, label: "Reports" },
          ]
        : [];

    const navItems = [
        { href: projectKey ? `/projects/${projectKey}` : "/", label: "Dashboard" },
        ...projectScoped,
        ...(canAccessSettings && projectKey
            ? [{ href: `/projects/${projectKey}/settings`, label: "Settings" }]
            : []),
        ...(isAdmin ? [{ href: "/settings", label: "Admin" }] : []),
    ];

    return (
        <nav className="mt-8 space-y-2">
            {navItems.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} />
            ))}
        </nav>
    );
}
