"use client";

import * as Command from "cmdk";
import { useRouter } from "next/navigation";
import { useState } from "react";

const commands = [
  { label: "Dashboard", href: "/" },
  { label: "Test Cases", href: "/testcases" },
  { label: "Test Plans", href: "/testplans" },
  { label: "Executions", href: "/executions" },
  { label: "Reports", href: "/reports" },
  { label: "Settings", href: "/settings" }
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 hidden rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:scale-105 lg:flex"
      >
        ⌘K
      </button>
      <Command.Dialog open={open} onOpenChange={setOpen} label="Global navigation">
        <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900 px-4 py-3">
          <Command.Input
            placeholder="Jump to..."
            className="w-full bg-transparent text-sm text-white outline-none"
          />
        </div>
        <Command.List className="bg-slate-950">
          <Command.Empty className="px-4 py-3 text-sm text-slate-500">No results.</Command.Empty>
          <Command.Group heading="Navigate" className="border-t border-slate-900">
            {commands.map((item) => (
              <Command.Item
                key={item.href}
                onSelect={() => {
                  router.push(item.href);
                  setOpen(false);
                }}
                className="flex items-center justify-between px-4 py-3 text-sm text-white data-[selected=true]:bg-slate-900"
              >
                {item.label}
                <span className="text-xs text-slate-500">↩</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </>
  );
}
