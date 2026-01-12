"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { User, Shield, ChevronDown, FolderOpen, Check, Settings } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

const ROLES = ["ADMIN", "LEAD", "TESTER", "VIEWER"] as const;

type ProjectInfo = {
    id: string;
    key: string;
    name: string;
};

type UserData = {
    id: string;
    name: string;
    email: string;
    role: string;
    image: string | null;
    createdAt: string;
    leadProjects: ProjectInfo[];
    assignedProjects: ProjectInfo[];
};

export default function UsersPage() {
    const queryClient = useQueryClient();
    const toast = useToast();
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editingProjectsUserId, setEditingProjectsUserId] = useState<string | null>(null);
    const [editingLeadProjectsUserId, setEditingLeadProjectsUserId] = useState<string | null>(null);
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
    const [selectedLeadProjects, setSelectedLeadProjects] = useState<string[]>([]);
    const [pendingRoleChange, setPendingRoleChange] = useState<{ userId: string; role: string; userName: string } | null>(null);

    const { data: users, isLoading, error } = useQuery<UserData[]>({
        queryKey: ["users"],
        queryFn: async () => {
            const res = await fetch("/api/users");
            if (!res.ok) {
                if (res.status === 403) throw new Error("Access denied");
                throw new Error("Failed to load users");
            }
            return res.json();
        },
    });

    const { data: projects } = useQuery<ProjectInfo[]>({
        queryKey: ["projects-list"],
        queryFn: async () => {
            const res = await fetch("/api/projects");
            if (!res.ok) throw new Error("Failed to load projects");
            return res.json();
        },
    });

    const updateRoleMutation = useMutation({
        mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
            const res = await fetch("/api/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, role }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to update role");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast({ title: "Role updated", description: "User role has been changed." });
            setEditingUserId(null);
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message });
        },
    });

    const updateProjectsMutation = useMutation({
        mutationFn: async ({ userId, projectIds }: { userId: string; projectIds: string[] }) => {
            const res = await fetch(`/api/users/${userId}/assigned-projects`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectIds }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to update projects");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast({ title: "Projects updated", description: "User project access has been updated." });
            setEditingProjectsUserId(null);
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message });
        },
    });

    const updateLeadProjectsMutation = useMutation({
        mutationFn: async ({ userId, projectIds }: { userId: string; projectIds: string[] }) => {
            const res = await fetch(`/api/users/${userId}/projects`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectIds }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to update lead projects");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast({ title: "Lead projects updated", description: "Lead settings access has been updated." });
            setEditingLeadProjectsUserId(null);
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message });
        },
    });

    const handleRoleChange = (userId: string, role: string, userName: string) => {
        setPendingRoleChange({ userId, role, userName });
        setEditingUserId(null);
    };

    const confirmRoleChange = () => {
        if (pendingRoleChange) {
            updateRoleMutation.mutate({ userId: pendingRoleChange.userId, role: pendingRoleChange.role });
            setPendingRoleChange(null);
        }
    };

    const openProjectEditor = (user: UserData) => {
        if (editingProjectsUserId === user.id) {
            setEditingProjectsUserId(null);
            return;
        }
        setSelectedProjects(user.assignedProjects.map(p => p.id));
        setEditingProjectsUserId(user.id);
        setEditingLeadProjectsUserId(null);
    };

    const openLeadProjectEditor = (user: UserData) => {
        if (editingLeadProjectsUserId === user.id) {
            setEditingLeadProjectsUserId(null);
            return;
        }
        setSelectedLeadProjects(user.leadProjects.map(p => p.id));
        setEditingLeadProjectsUserId(user.id);
        setEditingProjectsUserId(null);
    };

    const saveProjects = (userId: string) => {
        updateProjectsMutation.mutate({ userId, projectIds: selectedProjects });
    };

    const saveLeadProjects = (userId: string) => {
        updateLeadProjectsMutation.mutate({ userId, projectIds: selectedLeadProjects });
    };

    const toggleProject = (projectId: string) => {
        setSelectedProjects(prev =>
            prev.includes(projectId)
                ? prev.filter(id => id !== projectId)
                : [...prev, projectId]
        );
    };

    const toggleLeadProject = (projectId: string) => {
        setSelectedLeadProjects(prev =>
            prev.includes(projectId)
                ? prev.filter(id => id !== projectId)
                : [...prev, projectId]
        );
    };

    if (isLoading) {
        return (
            <div className="p-8">
                <h1 className="text-2xl font-bold text-foreground mb-6">User Management</h1>
                <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-card/50 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8">
                <h1 className="text-2xl font-bold text-foreground mb-6">User Management</h1>
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
                    <Shield className="h-12 w-12 mx-auto text-destructive/50 mb-4" />
                    <p className="text-destructive">{(error as Error).message}</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="p-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-foreground">User Management</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Manage user roles and project access. Only admins can access this page.
                    </p>
                </div>

                <div className="rounded-xl border border-border bg-card/50 overflow-visible">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border bg-card/30">
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">User</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Email</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Role</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Projects</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Settings Access</th>
                                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Joined</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users?.map((user) => (
                                <tr key={user.id} className="border-b border-border/50 last:border-0 hover:bg-card/30 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                {user.image ? (
                                                    <span className="relative h-9 w-9 rounded-full overflow-hidden">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={user.image} alt={user.name || "User"} className="h-9 w-9 rounded-full object-cover" />
                                                    </span>
                                                ) : (
                                                    <User className="h-4 w-4" />
                                                )}
                                            </div>
                                            <span className="font-medium text-foreground">{user.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground text-sm">{user.email}</td>
                                    <td className="px-4 py-3">
                                        <div className="relative">
                                            <button
                                                onClick={() => setEditingUserId(editingUserId === user.id ? null : user.id)}
                                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-card border border-border hover:bg-card/80 transition-colors"
                                            >
                                                <span className={`inline-block w-2 h-2 rounded-full ${user.role === "ADMIN" ? "bg-red-500" :
                                                    user.role === "LEAD" ? "bg-amber-500" :
                                                        user.role === "TESTER" ? "bg-blue-500" : "bg-slate-400"
                                                    }`} />
                                                {user.role}
                                                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                            </button>
                                            {editingUserId === user.id && (
                                                <div className="absolute z-10 mt-1 w-32 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                                                    {ROLES.map((role) => (
                                                        <button
                                                            key={role}
                                                            onClick={() => handleRoleChange(user.id, role, user.name)}
                                                            disabled={updateRoleMutation.isPending}
                                                            className={`w-full text-left px-3 py-2 text-sm hover:bg-card/80 transition-colors flex items-center gap-2 ${user.role === role ? "bg-primary/10 text-primary" : "text-foreground"
                                                                }`}
                                                        >
                                                            <span className={`inline-block w-2 h-2 rounded-full ${role === "ADMIN" ? "bg-red-500" :
                                                                role === "LEAD" ? "bg-amber-500" :
                                                                    role === "TESTER" ? "bg-blue-500" : "bg-slate-400"
                                                                }`} />
                                                            {role}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    {/* Projects column - for non-admin users */}
                                    <td className="px-4 py-3">
                                        {user.role !== "ADMIN" ? (
                                            <div className="relative">
                                                <button
                                                    onClick={() => openProjectEditor(user)}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-card border border-border hover:bg-card/80 transition-colors"
                                                >
                                                    <FolderOpen className="h-4 w-4 text-blue-500" />
                                                    <span className="text-muted-foreground">
                                                        {user.assignedProjects.length > 0
                                                            ? user.assignedProjects.map(p => p.key).join(", ")
                                                            : "None"}
                                                    </span>
                                                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                                </button>
                                                {editingProjectsUserId === user.id && (
                                                    <div className="absolute z-10 mt-1 w-64 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                                                        <div className="p-2 border-b border-border">
                                                            <p className="text-xs text-muted-foreground font-medium px-2">Assign projects:</p>
                                                        </div>
                                                        <div className="max-h-48 overflow-auto">
                                                            {projects?.map((project) => (
                                                                <button
                                                                    key={project.id}
                                                                    onClick={() => toggleProject(project.id)}
                                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-card/80 transition-colors flex items-center justify-between"
                                                                >
                                                                    <span className="flex items-center gap-2">
                                                                        <span className="text-xs text-blue-500 font-mono">{project.key}</span>
                                                                        <span className="text-foreground">{project.name}</span>
                                                                    </span>
                                                                    {selectedProjects.includes(project.id) && (
                                                                        <Check className="h-4 w-4 text-green-500" />
                                                                    )}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="p-2 border-t border-border flex gap-2 justify-end">
                                                            <button
                                                                onClick={() => setEditingProjectsUserId(null)}
                                                                className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-card/80"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={() => saveProjects(user.id)}
                                                                disabled={updateProjectsMutation.isPending}
                                                                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                                            >
                                                                {updateProjectsMutation.isPending ? "Saving..." : "Save"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">All (Admin)</span>
                                        )}
                                    </td>
                                    {/* Settings Access column - for LEADs only */}
                                    <td className="px-4 py-3">
                                        {user.role === "LEAD" ? (
                                            <div className="relative">
                                                <button
                                                    onClick={() => openLeadProjectEditor(user)}
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-card border border-border hover:bg-card/80 transition-colors"
                                                >
                                                    <Settings className="h-4 w-4 text-amber-500" />
                                                    <span className="text-muted-foreground">
                                                        {user.leadProjects.length > 0
                                                            ? user.leadProjects.map(p => p.key).join(", ")
                                                            : "None"}
                                                    </span>
                                                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                                </button>
                                                {editingLeadProjectsUserId === user.id && (
                                                    <div className="absolute z-10 mt-1 w-64 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                                                        <div className="p-2 border-b border-border">
                                                            <p className="text-xs text-muted-foreground font-medium px-2">Settings access:</p>
                                                        </div>
                                                        <div className="max-h-48 overflow-auto">
                                                            {projects?.map((project) => (
                                                                <button
                                                                    key={project.id}
                                                                    onClick={() => toggleLeadProject(project.id)}
                                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-card/80 transition-colors flex items-center justify-between"
                                                                >
                                                                    <span className="flex items-center gap-2">
                                                                        <span className="text-xs text-amber-500 font-mono">{project.key}</span>
                                                                        <span className="text-foreground">{project.name}</span>
                                                                    </span>
                                                                    {selectedLeadProjects.includes(project.id) && (
                                                                        <Check className="h-4 w-4 text-green-500" />
                                                                    )}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="p-2 border-t border-border flex gap-2 justify-end">
                                                            <button
                                                                onClick={() => setEditingLeadProjectsUserId(null)}
                                                                className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-card/80"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={() => saveLeadProjects(user.id)}
                                                                disabled={updateLeadProjectsMutation.isPending}
                                                                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                                            >
                                                                {updateLeadProjectsMutation.isPending ? "Saving..." : "Save"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : user.role === "ADMIN" ? (
                                            <span className="text-muted-foreground text-sm">All (Admin)</span>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground text-sm">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Role Change Confirmation */}
            <ConfirmationDialog
                open={!!pendingRoleChange}
                onOpenChange={(open) => !open && setPendingRoleChange(null)}
                title="Change User Role"
                description={pendingRoleChange ? `Are you sure you want to change ${pendingRoleChange.userName}'s role to ${pendingRoleChange.role}?` : ""}
                confirmLabel="Change Role"
                variant="default"
                onConfirm={confirmRoleChange}
                isLoading={updateRoleMutation.isPending}
            />
        </>
    );
}
