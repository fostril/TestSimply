import { ReactNode } from "react";
import { ProjectSwitcher } from "@/components/project-switcher";
import { CommandPalette } from "@/components/ui/command-palette";
import { NavLink } from "@/components/nav-link";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/testcases", label: "Test Cases" },
  { href: "/testplans", label: "Plans" },
  { href: "/executions", label: "Executions" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" }
];

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col border-r border-slate-800 bg-slate-950/80 p-6 lg:flex">
        <div className="mb-8">
          <div className="text-xl font-semibold text-white">TestSimply</div>
          <p className="mt-1 text-xs text-slate-500">Test Management Toolkit</p>
        </div>
        <ProjectSwitcher />
        <nav className="mt-8 space-y-2">
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto bg-slate-950/95">
        <CommandPalette />
        {children}
      </main>
    </div>
  );
}
