"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut, User } from "lucide-react";

export function UserProfile() {
    const { data: session } = useSession();

    return (
        <div className="mt-auto border-t border-border pt-4">
            <div className="flex items-center gap-3 rounded-xl bg-card/30 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-4 w-4" />
                </div>
                <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-medium text-foreground">
                        {session?.user?.name || "User"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                        {session?.user?.email || ""}
                    </p>
                </div>
                <button
                    onClick={() => signOut({ callbackUrl: "/auth/login" })}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Sign out"
                >
                    <LogOut className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
