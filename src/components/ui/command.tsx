// Minimal command wrapper compatible with your import.
// File: src/components/ui/command.tsx
"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import clsx from "clsx";

function cn(...s: Array<string | undefined | false>) {
  return clsx(s);
}

export function Command({
                          className,
                          ...props
                        }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-md border bg-background text-foreground",
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
    <div className="flex items-center border-b px-3">
      <CommandPrimitive.Input
        className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
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
      className="py-6 text-center text-sm text-muted-foreground"
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
      className={cn("overflow-hidden p-1 text-foreground", className)}
      {...props}
    />
  );
}

export function CommandSeparator(
  props: React.ComponentProps<typeof CommandPrimitive.Separator>
) {
  return (
    <CommandPrimitive.Separator className="my-1 h-px bg-border" {...props} />
  );
}

export function CommandItem(
  { className, ...props }:
  React.ComponentProps<typeof CommandPrimitive.Item>
) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-2 text-sm",
        "aria-selected:bg-accent aria-selected:text-accent-foreground",
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          aria-label={label}
          className="fixed left-1/2 top-20 z-50 w-[90vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover shadow-xl"
        >
          <Command className="bg-popover">
            {children}
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
