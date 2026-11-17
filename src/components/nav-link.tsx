"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavLinkProps = {
  href: string;
  label: string;
  exact?: boolean;
  className?: string;
};

export function NavLink({ href, label, exact = false, className }: NavLinkProps) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname?.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "block rounded-md px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-blue-50 font-medium text-blue-700"
          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
        className
      )}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}
