"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, User, KeyRound } from "lucide-react";
import Link from "next/link";

export function UserProfile() {
    const { data: session } = useSession();

    return (
        <div className="mt-auto border-t border-slate-200 pt-3">
            <div className="flex items-center gap-2.5 rounded-md p-2">
                <Link
                    href="/settings/profile"
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 -m-1 transition-colors hover:bg-slate-100"
                    title="Profile & security settings"
                >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                        <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                            {session?.user?.name || "User"}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                            {session?.user?.email || ""}
                        </p>
                    </div>
                </Link>
                <Link
                    href="/settings/tokens"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    title="Personal tokens"
                >
                    <KeyRound className="h-4 w-4" />
                </Link>
                <button
                    onClick={() => signOut({ callbackUrl: "/auth/login" })}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                    title="Sign out"
                >
                    <LogOut className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
