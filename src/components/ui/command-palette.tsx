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
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";

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

  const commands = [
    { label: "Dashboard", href: projectKey ? `/projects/${projectKey}` : "/" },
    ...(projectKey
      ? [
          { label: "Test Cases", href: `/projects/${projectKey}/testcases` },
          { label: "Test Plans", href: `/projects/${projectKey}/testplans` },
          { label: "Test Sets", href: `/projects/${projectKey}/test-sets` },
          { label: "Requirements", href: `/projects/${projectKey}/requirements` },
          { label: "Executions", href: `/projects/${projectKey}/executions` },
          { label: "Bugs", href: `/projects/${projectKey}/bugs` },
          { label: "Reports", href: `/projects/${projectKey}/reports` },
        ]
      : []),
    { label: "Personal tokens", href: "/settings/tokens" },
    ...(isAdmin ? [{ label: "Admin", href: "/settings" }] : []),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 hidden rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:scale-105 lg:flex"
        aria-label="Open command palette"
      >
        ⌘K
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} label="Global navigation">
        <CommandInput placeholder="Jump to..." />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>

          <CommandGroup heading="Navigate">
            {commands.map((item) => (
              <CommandItem
                key={item.href}
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

          <CommandSeparator />
        </CommandList>
      </CommandDialog>
    </>
  );
}
