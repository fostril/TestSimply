"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { cn } from "@/lib/utils";

export function Command({
                          className,
                          ...props
                        }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-md border border-slate-200 bg-white text-slate-900",
        className
      )}
      {...props}
    />
  );
}

export function CommandInput(
  props: React.ComponentProps<typeof CommandPrimitive.Input>
) {
  return (
    <div className="flex items-center border-b border-slate-200 px-3">
      <CommandPrimitive.Input
        className="h-10 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
        {...props}
      />
    </div>
  );
}

export function CommandList(
  props: React.ComponentProps<typeof CommandPrimitive.List>
) {
  return (
    <CommandPrimitive.List
      className="max-h-[400px] overflow-y-auto p-1"
      {...props}
    />
  );
}

export function CommandEmpty(
  props: React.ComponentProps<typeof CommandPrimitive.Empty>
) {
  return (
    <CommandPrimitive.Empty
      className="py-6 text-center text-sm text-slate-500"
      {...props}
    />
  );
}

export function CommandGroup(
  { className, ...props }:
  React.ComponentProps<typeof CommandPrimitive.Group>
) {
  return (
    <CommandPrimitive.Group
      className={cn("overflow-hidden p-1 text-slate-900", className)}
      {...props}
    />
  );
}

export function CommandSeparator(
  props: React.ComponentProps<typeof CommandPrimitive.Separator>
) {
  return (
    <CommandPrimitive.Separator className="my-1 h-px bg-slate-200" {...props} />
  );
}

export function CommandItem(
  { className, ...props }:
  React.ComponentProps<typeof CommandPrimitive.Item>
) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-2 text-sm text-slate-700",
        "aria-selected:bg-slate-100 aria-selected:text-slate-900",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function CommandDialog({
                                children,
                                open,
                                onOpenChange,
                                label,
                              }: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  label?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50" />
        <Dialog.Content
          aria-label={label}
          className="fixed left-1/2 top-20 z-50 w-[90vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <Command className="border-0 bg-white">
            {children}
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
