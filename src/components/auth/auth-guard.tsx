"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const { status } = useSession();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (status === "unauthenticated") {
            router.replace(`/auth/login?callbackUrl=${encodeURIComponent(pathname)}`);
        }
    }, [status, router, pathname]);

    if (status === "loading") {
        return (
            <div className="flex h-screen w-full items-center justify-center p-8">
                <div className="w-full max-w-md space-y-4">
                    <LoadingSkeleton count={3} />
                    <p className="text-center text-sm text-muted-foreground">Verifying session...</p>
                </div>
            </div>
        );
    }

    if (status === "unauthenticated") {
        return null; // Don't render anything while redirecting
    }

    return <>{children}</>;
}
