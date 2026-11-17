import { cn } from "@/lib/utils";

export function LoadingSkeleton({ className, count = 3 }: { className?: string; count?: number }) {
    return (
        <div className={cn("space-y-3", className)}>
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="h-12 w-full animate-pulse rounded-md bg-slate-200"
                    style={{ animationDelay: `${i * 100}ms` }}
                />
            ))}
        </div>
    );
}
