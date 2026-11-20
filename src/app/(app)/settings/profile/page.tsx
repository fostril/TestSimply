"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { CheckCircle2, Mail, Shield, User } from "lucide-react";
import { useToast } from "@/components/ui/toast";

type ProfileData = {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: string | null;
  image: string | null;
  createdAt: string;
  hasPassword: boolean;
};

export default function ProfileSettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { update } = useSession();

  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: profile, isLoading, error } = useQuery<ProfileData>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await fetch("/api/users/me");
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  useEffect(() => {
    if (profile?.name) {
      setName(profile.name);
    }
  }, [profile?.name]);

  const updateNameMutation = useMutation({
    mutationFn: async (nextName: string) => {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.issues?.[0]?.message || body?.error || "Failed to update name");
      }
      return body;
    },
    onSuccess: async (updated) => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      await update({ name: updated.name });
      toast({ title: "Profile updated" });
    },
    onError: (err: unknown) => {
      toast({ title: "Update failed", description: (err as Error).message });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error("New passwords do not match");
      }
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: profile?.hasPassword ? currentPassword : undefined,
          newPassword,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.issues?.[0]?.message || body?.error || "Failed to change password");
      }
      return body;
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      toast({ title: "Password updated" });
    },
    onError: (err: unknown) => {
      toast({ title: "Password update failed", description: (err as Error).message });
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: profile?.email }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Failed to send verification email");
      }
      return body;
    },
    onSuccess: (data) => {
      toast({
        title: "Verification email requested",
        description: data.message,
      });
    },
    onError: (err: unknown) => {
      toast({ title: "Request failed", description: (err as Error).message });
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-6">
        <h1 className="text-2xl font-semibold text-slate-900">Profile & Security</h1>
        <p className="mt-2 text-sm text-slate-500">Loading your profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-6">
        <h1 className="text-2xl font-semibold text-slate-900">Profile & Security</h1>
        <p className="mt-2 text-sm text-red-600">{(error as Error)?.message || "Unable to load profile"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-8 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Profile & Security</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage your display name, email verification status, and account password.
        </p>
      </div>

      {/* Account Overview */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              {profile.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={profile.image} alt={profile.name} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <User className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">{profile.name}</h2>
              <p className="text-sm text-slate-600">{profile.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
              <Shield className="h-3.5 w-3.5 text-slate-500" />
              {profile.role}
            </span>
            {profile.emailVerified ? (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                <Mail className="h-3.5 w-3.5" />
                Unverified
              </span>
            )}
          </div>
        </div>

        {!profile.emailVerified && profile.hasPassword && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>Your email address has not been verified yet.</span>
            <button
              type="button"
              onClick={() => resendVerificationMutation.mutate()}
              disabled={resendVerificationMutation.isPending}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {resendVerificationMutation.isPending ? "Sending..." : "Resend verification email"}
            </button>
          </div>
        )}
      </div>

      {/* Display Name */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateNameMutation.mutate(name);
        }}
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-base font-semibold text-slate-900">Display Name</h2>
        <p className="mt-1 text-xs text-slate-500">Shown on test runs, audit logs, and assigned projects.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={100}
              required
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          <button
            type="submit"
            disabled={updateNameMutation.isPending || name.trim() === profile.name}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {updateNameMutation.isPending ? "Saving..." : "Save Name"}
          </button>
        </div>
      </form>

      {/* Change Password */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          changePasswordMutation.mutate();
        }}
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-base font-semibold text-slate-900">
          {profile.hasPassword ? "Change Password" : "Set Account Password"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Use at least 8 characters. Avoid common or previously leaked passwords.
        </p>

        <div className="mt-4 space-y-4">
          {profile.hasPassword && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                New Password
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
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
