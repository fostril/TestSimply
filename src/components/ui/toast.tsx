"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";

const ToastContext = createContext<(props: { title: string; description?: string }) => void>(() => {});

type ToastState = { title: string; description?: string } | null;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toast, setToast] = useState<ToastState>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(() => {
      setVisible(false);
    }, 4000);

    return () => clearTimeout(timer);
  }, [visible]);

  const push = useMemo(() => {
    return ({ title, description }: { title: string; description?: string }) => {
      setToast({ title, description });
      setVisible(true);
    };
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {visible && toast ? (
          <div className="w-72 rounded-xl border border-slate-800 bg-slate-950/90 p-4 text-white shadow-2xl">
            <p className="text-sm font-semibold">{toast.title}</p>
            {toast.description ? (
              <p className="mt-1 text-xs text-slate-300">{toast.description}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
