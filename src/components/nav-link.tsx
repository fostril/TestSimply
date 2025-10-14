"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils"; // or wherever your cn helper lives

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
        "block rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-900 hover:text-white",
        active ? "bg-slate-900 text-white" : undefined,
        className
      )}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}
