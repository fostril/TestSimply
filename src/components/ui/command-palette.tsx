"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"; // shadcn/ui wrapper (uses cmdk under the hood)

const commands = [
  { label: "Dashboard", href: "/" },
  { label: "Test Cases", href: "/testcases" },
  { label: "Test Plans", href: "/testplans" },
  { label: "Executions", href: "/executions" },
  { label: "Reports", href: "/reports" },
  { label: "Settings", href: "/settings" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Open with ⌘K / Ctrl+K
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
