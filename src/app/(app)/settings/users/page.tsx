"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/toast";
import {
    User,
    Shield,
    ChevronDown,
    FolderOpen,
    Check,
    Settings,
    Plus,
    Trash2,
    X,
} from "lucide-react";
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
    const { data: session } = useSession();
    const currentUserId = (session?.user as { id?: string } | undefined)?.id;

    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editingProjectsUserId, setEditingProjectsUserId] = useState<string | null>(null);
    const [editingLeadProjectsUserId, setEditingLeadProjectsUserId] = useState<string | null>(null);
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
    const [selectedLeadProjects, setSelectedLeadProjects] = useState<string[]>([]);
    const [pendingRoleChange, setPendingRoleChange] = useState<{
        userId: string;
        role: string;
        userName: string;
    } | null>(null);
    const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const [newName, setNewName] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRole, setNewRole] = useState<(typeof ROLES)[number]>("TESTER");

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

    const createUserMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newName,
                    email: newEmail,
                    password: newPassword,
                    role: newRole,
                }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(body?.issues?.[0]?.message || body?.error || "Failed to create user");
            }
            return body;
        },
        onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast({ title: "User created", description: `${created.email} added as ${created.role}.` });
            setIsCreateModalOpen(false);
            setNewName("");
            setNewEmail("");
            setNewPassword("");
            setNewRole("TESTER");
        },
        onError: (err: Error) => {
            toast({ title: "Create failed", description: err.message });
        },
    });

    const deleteUserMutation = useMutation({
        mutationFn: async (userId: string) => {
            const res = await fetch(`/api/users/${userId}`, {
                method: "DELETE",
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(body?.error || "Failed to delete user");
            }
            return body;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast({ title: "User deleted" });
            setUserToDelete(null);
        },
        onError: (err: Error) => {
            toast({ title: "Delete failed", description: err.message });
        },
    });

    const updateRoleMutation = useMutation({
        mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
            const res = await fetch("/api/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, role }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || "Failed to update role");
            }
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast({ title: "Role updated", description: "User role has been changed." });
            setEditingUserId(null);
        },
        onError: (err: Error) => {
            toast({ title: "Error", description: err.message });
        },
    });

    const updateProjectsMutation = useMutation({
        mutationFn: async ({ userId, projectIds }: { userId: string; projectIds: string[] }) => {
            const res = await fetch(`/api/users/${userId}/assigned-projects`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectIds }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || "Failed to update projects");
            }
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast({ title: "Projects updated", description: "User project access has been updated." });
            setEditingProjectsUserId(null);
        },
        onError: (err: Error) => {
            toast({ title: "Error", description: err.message });
        },
    });

    const updateLeadProjectsMutation = useMutation({
        mutationFn: async ({ userId, projectIds }: { userId: string; projectIds: string[] }) => {
            const res = await fetch(`/api/users/${userId}/projects`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectIds }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || "Failed to update lead projects");
            }
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast({ title: "Lead projects updated", description: "Lead settings access has been updated." });
            setEditingLeadProjectsUserId(null);
        },
        onError: (err: Error) => {
            toast({ title: "Error", description: err.message });
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
        setSelectedProjects(user.assignedProjects.map((p) => p.id));
        setEditingProjectsUserId(user.id);
        setEditingLeadProjectsUserId(null);
        setEditingUserId(null);
    };

    const openLeadProjectEditor = (user: UserData) => {
        if (editingLeadProjectsUserId === user.id) {
            setEditingLeadProjectsUserId(null);
            return;
        }
        setSelectedLeadProjects(user.leadProjects.map((p) => p.id));
        setEditingLeadProjectsUserId(user.id);
        setEditingProjectsUserId(null);
        setEditingUserId(null);
    };

    const toggleProject = (projectId: string) => {
        setSelectedProjects((prev) =>
            prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
        );
    };

    const toggleLeadProject = (projectId: string) => {
        setSelectedLeadProjects((prev) =>
            prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
        );
    };

    if (isLoading) {
        return (
            <div className="mx-auto max-w-6xl px-6 py-6">
                <h1 className="mb-6 text-2xl font-semibold text-slate-900">User Management</h1>
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white" />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mx-auto max-w-6xl px-6 py-6">
                <h1 className="mb-6 text-2xl font-semibold text-slate-900">User Management</h1>
                <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
                    <Shield className="mx-auto mb-3 h-10 w-10 text-red-400" />
                    <p className="text-sm font-medium text-red-700">{(error as Error).message}</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="mx-auto max-w-6xl px-6 py-6">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">User Management</h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Create accounts, assign roles, and control project access. Only admins can access this page.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsCreateModalOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        <Plus className="h-4 w-4" />
                        New User
                    </button>
                </div>

                <div className="overflow-visible rounded-lg border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-4 py-3">User</th>
                                <th className="px-4 py-3">Email</th>
                                <th className="px-4 py-3">Role</th>
                                <th className="px-4 py-3">Projects</th>
                                <th className="px-4 py-3">Settings Access</th>
                                <th className="px-4 py-3">Joined</th>
                                <th className="w-12 px-4 py-3 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {users?.map((user) => (
                                <tr key={user.id} className="transition-colors hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                                                {user.image ? (
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img
                                                        src={user.image}
                                                        alt={user.name || "User"}
                                                        className="h-9 w-9 rounded-full object-cover"
                                                    />
                                                ) : (
                                                    <User className="h-4 w-4" />
                                                )}
                                            </div>
                                            <span className="font-medium text-slate-900">{user.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                                    <td className="px-4 py-3">
                                        <div className="relative inline-block">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingUserId(editingUserId === user.id ? null : user.id);
                                                    setEditingProjectsUserId(null);
                                                    setEditingLeadProjectsUserId(null);
                                                }}
                                                className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                            >
                                                <span
                                                    className={`inline-block h-2 w-2 rounded-full ${
                                                        user.role === "ADMIN"
                                                            ? "bg-red-500"
                                                            : user.role === "LEAD"
                                                                ? "bg-amber-500"
                                                                : user.role === "TESTER"
                                                                    ? "bg-blue-500"
                                                                    : "bg-slate-400"
                                                    }`}
                                                />
                                                {user.role}
                                                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                            </button>
                                            {editingUserId === user.id && (
                                                <div className="absolute z-20 mt-1 w-36 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                                                    {ROLES.map((role) => (
                                                        <button
                                                            key={role}
                                                            type="button"
                                                            onClick={() => handleRoleChange(user.id, role, user.name)}
                                                            disabled={updateRoleMutation.isPending}
                                                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${
                                                                user.role === role
                                                                    ? "bg-blue-50 font-medium text-blue-700"
                                                                    : "text-slate-700"
                                                            }`}
                                                        >
                                                            <span
                                                                className={`inline-block h-2 w-2 rounded-full ${
                                                                    role === "ADMIN"
                                                                        ? "bg-red-500"
                                                                        : role === "LEAD"
                                                                            ? "bg-amber-500"
                                                                            : role === "TESTER"
                                                                                ? "bg-blue-500"
                                                                                : "bg-slate-400"
                                                                }`}
                                                            />
                                                            {role}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {user.role !== "ADMIN" ? (
                                            <div className="relative inline-block">
                                                <button
                                                    type="button"
                                                    onClick={() => openProjectEditor(user)}
                                                    className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                                                >
                                                    <FolderOpen className="h-4 w-4 text-blue-600" />
                                                    <span className="text-slate-600">
                                                        {user.assignedProjects.length > 0
                                                            ? user.assignedProjects.map((p) => p.key).join(", ")
                                                            : "None"}
                                                    </span>
                                                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                                </button>
                                                {editingProjectsUserId === user.id && (
                                                    <div className="absolute z-20 mt-1 w-64 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                                                        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                                                            <p className="text-xs font-medium text-slate-600">
                                                                Assign projects:
                                                            </p>
                                                        </div>
                                                        <div className="max-h-48 overflow-auto">
                                                            {projects?.map((project) => (
                                                                <button
                                                                    key={project.id}
                                                                    type="button"
                                                                    onClick={() => toggleProject(project.id)}
                                                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50"
                                                                >
                                                                    <span className="flex items-center gap-2">
                                                                        <span className="font-mono text-xs text-blue-600">
                                                                            {project.key}
                                                                        </span>
                                                                        <span className="text-slate-900">
                                                                            {project.name}
                                                                        </span>
                                                                    </span>
                                                                    {selectedProjects.includes(project.id) && (
                                                                        <Check className="h-4 w-4 text-emerald-600" />
                                                                    )}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingProjectsUserId(null)}
                                                                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    updateProjectsMutation.mutate({
                                                                        userId: user.id,
                                                                        projectIds: selectedProjects,
                                                                    })
                                                                }
                                                                disabled={updateProjectsMutation.isPending}
                                                                className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                                            >
                                                                {updateProjectsMutation.isPending
                                                                    ? "Saving..."
                                                                    : "Save"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-sm text-slate-500">All (Admin)</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {user.role === "LEAD" ? (
                                            <div className="relative inline-block">
                                                <button
                                                    type="button"
                                                    onClick={() => openLeadProjectEditor(user)}
                                                    className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                                                >
                                                    <Settings className="h-4 w-4 text-amber-600" />
                                                    <span className="text-slate-600">
                                                        {user.leadProjects.length > 0
                                                            ? user.leadProjects.map((p) => p.key).join(", ")
                                                            : "None"}
                                                    </span>
                                                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                                </button>
                                                {editingLeadProjectsUserId === user.id && (
                                                    <div className="absolute z-20 mt-1 w-64 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                                                        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                                                            <p className="text-xs font-medium text-slate-600">
                                                                Settings access:
                                                            </p>
                                                        </div>
                                                        <div className="max-h-48 overflow-auto">
                                                            {projects?.map((project) => (
                                                                <button
                                                                    key={project.id}
                                                                    type="button"
                                                                    onClick={() => toggleLeadProject(project.id)}
                                                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50"
                                                                >
                                                                    <span className="flex items-center gap-2">
                                                                        <span className="font-mono text-xs text-amber-600">
                                                                            {project.key}
                                                                        </span>
                                                                        <span className="text-slate-900">
                                                                            {project.name}
                                                                        </span>
                                                                    </span>
                                                                    {selectedLeadProjects.includes(project.id) && (
                                                                        <Check className="h-4 w-4 text-emerald-600" />
                                                                    )}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingLeadProjectsUserId(null)}
                                                                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    updateLeadProjectsMutation.mutate({
                                                                        userId: user.id,
                                                                        projectIds: selectedLeadProjects,
                                                                    })
                                                                }
                                                                disabled={updateLeadProjectsMutation.isPending}
                                                                className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                                            >
                                                                {updateLeadProjectsMutation.isPending
                                                                    ? "Saving..."
                                                                    : "Save"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : user.role === "ADMIN" ? (
                                            <span className="text-sm text-slate-500">All (Admin)</span>
                                        ) : (
                                            <span className="text-sm text-slate-400">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {user.id !== currentUserId && (
                                            <button
                                                type="button"
                                                onClick={() => setUserToDelete(user)}
                                                className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                                title={`Delete ${user.name}`}
                                                aria-label={`Delete ${user.email}`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Create User</h2>
                                <p className="mt-1 text-xs text-slate-500">
                                    Provision a verified user account with an initial password and role.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsCreateModalOpen(false)}
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                aria-label="Close modal"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                createUserMutation.mutate();
                            }}
                            className="mt-5 space-y-4"
                        >
                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    minLength={2}
                                    maxLength={100}
                                    required
                                    placeholder="Jane Doe"
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    required
                                    placeholder="jane@company.com"
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                                        Initial Password
                                    </label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        minLength={8}
                                        required
                                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                                        Role
                                    </label>
                                    <select
                                        value={newRole}
                                        onChange={(e) => setNewRole(e.target.value as (typeof ROLES)[number])}
                                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                    >
                                        {ROLES.map((role) => (
                                            <option key={role} value={role}>
                                                {role}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={createUserMutation.isPending}
                                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {createUserMutation.isPending ? "Creating..." : "Create User"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Role Change Confirmation */}
            <ConfirmationDialog
                open={!!pendingRoleChange}
                onOpenChange={(open) => !open && setPendingRoleChange(null)}
                title="Change User Role"
                description={
                    pendingRoleChange
                        ? `Are you sure you want to change ${pendingRoleChange.userName}'s role to ${pendingRoleChange.role}?`
                        : ""
                }
                confirmLabel="Change Role"
                variant="default"
                onConfirm={confirmRoleChange}
                isLoading={updateRoleMutation.isPending}
            />

            {/* Delete User Confirmation */}
            <ConfirmationDialog
                open={!!userToDelete}
                onOpenChange={(open) => !open && setUserToDelete(null)}
                title="Delete User"
                description={
                    userToDelete
                        ? `Delete ${userToDelete.name} (${userToDelete.email})? This permanently removes their account, tokens, and sessions.`
                        : ""
                }
                confirmLabel="Delete User"
                variant="destructive"
                onConfirm={() => {
                    if (userToDelete) {
                        deleteUserMutation.mutate(userToDelete.id);
                    }
                }}
                isLoading={deleteUserMutation.isPending}
            />
        </>
    );
}
