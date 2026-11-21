"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useProjectStore } from "@/lib/stores/project-store";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const projectKey = useProjectStore((state) => state.projectKey);
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "ADMIN";
  const isLead = role === "LEAD";

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigationCommands = [
    { label: "Dashboard", href: projectKey ? `/projects/${projectKey}` : "/" },
    ...(projectKey
      ? [
          { label: "Test Cases", href: `/projects/${projectKey}/testcases` },
          { label: "Test Plans", href: `/projects/${projectKey}/testplans` },
          { label: "Test Sets", href: `/projects/${projectKey}/test-sets` },
          { label: "Preconditions", href: `/projects/${projectKey}/preconditions` },
          { label: "Requirements", href: `/projects/${projectKey}/requirements` },
          { label: "Environments", href: `/projects/${projectKey}/environments` },
          { label: "Executions", href: `/projects/${projectKey}/executions` },
          { label: "Bugs", href: `/projects/${projectKey}/bugs` },
          { label: "Reports", href: `/projects/${projectKey}/reports` },
          ...(isAdmin || isLead
            ? [{ label: "Project Settings", href: `/projects/${projectKey}/settings` }]
            : []),
        ]
      : []),
    { label: "Profile & Security", href: "/settings/profile" },
    { label: "Personal Access Tokens", href: "/settings/tokens" },
    ...(isAdmin || isLead ? [{ label: "Audit Logs", href: "/settings/audit-logs" }] : []),
    ...(isAdmin
      ? [
          { label: "User Management", href: "/settings/users" },
          { label: "Admin Overview", href: "/settings" },
        ]
      : []),
  ];

  const quickActions = projectKey
    ? [
        { label: "+ New Test Case", href: `/projects/${projectKey}/testcases/new` },
        { label: "+ New Execution", href: `/projects/${projectKey}/executions/new` },
        { label: "+ New Test Plan", href: `/projects/${projectKey}/testplans/new` },
        { label: "+ New Test Set", href: `/projects/${projectKey}/test-sets/new` },
        { label: "+ Report Bug", href: `/projects/${projectKey}/bugs/new` },
      ]
    : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        aria-label="Open command palette"
      >
        <span>Jump to...</span>
        <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">⌘K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} label="Global navigation">
        <CommandInput placeholder="Search pages or quick actions..." />
        <CommandList>
          <CommandEmpty>No matching pages or actions.</CommandEmpty>

          {quickActions.length > 0 && (
            <>
              <CommandGroup heading="Quick Actions">
                {quickActions.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={item.label}
                    onSelect={() => {
                      router.push(item.href);
                      setOpen(false);
                    }}
                  >
                    <span className="flex-1 font-medium text-blue-600">{item.label}</span>
                    <span className="text-xs text-slate-400">↩</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          <CommandGroup heading="Navigate">
            {navigationCommands.map((item) => (
              <CommandItem
                key={item.href}
                value={item.label}
                onSelect={() => {
                  router.push(item.href);
                  setOpen(false);
                }}
              >
                <span className="flex-1">{item.label}</span>
                <span className="text-xs text-slate-500">↩</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
