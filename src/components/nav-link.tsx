"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-900 hover:text-white",
        active && "bg-slate-900 text-white"
      )}
    >
      {label}
    </Link>
  );
}
