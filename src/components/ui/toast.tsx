"use client";

import * as ToastPrimitives from "@radix-ui/react-toast";
import { ReactNode, createContext, useContext, useState } from "react";

const ToastContext = createContext<(props: { title: string; description?: string }) => void>(() => {});

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<{ title: string; description?: string } | null>(null);

  const push = ({ title, description }: { title: string; description?: string }) => {
    setContent({ title, description });
    setOpen(true);
  };

  return (
    <ToastContext.Provider value={push}>
      <ToastPrimitives.Provider swipeDirection="right">
        {children}
        <ToastPrimitives.Root open={open} onOpenChange={setOpen} className="bg-slate-900 text-white p-4 rounded-lg shadow-xl">
          <ToastPrimitives.Title className="font-semibold text-sm">{content?.title}</ToastPrimitives.Title>
          {content?.description ? (
            <ToastPrimitives.Description className="text-xs opacity-80">
              {content.description}
            </ToastPrimitives.Description>
          ) : null}
        </ToastPrimitives.Root>
        <ToastPrimitives.Viewport className="fixed top-4 right-4 z-50" />
      </ToastPrimitives.Provider>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
