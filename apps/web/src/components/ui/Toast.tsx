"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NB_SURFACE } from "./styles";

type ToastVariant = "success" | "info" | "warning" | "error";

interface ToastInput {
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  toast: (input: ToastInput) => void;
}

const MAX_VISIBLE = 3;

/** Errors have no auto-dismiss: the operator has to read them. */
const DURATION_MS: Record<Exclude<ToastVariant, "error">, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
};

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "bg-success-soft",
  info: "bg-info",
  warning: "bg-warning-soft",
  error: "bg-danger-soft",
};

const ToastContext = createContext<ToastApi | null>(null);

const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setItems((current) => {
        const next = [...current, { ...input, id }];
        const overflow = next.slice(0, Math.max(0, next.length - MAX_VISIBLE));
        overflow.forEach((old) => {
          const timer = timers.current.get(old.id);
          if (timer) clearTimeout(timer);
          timers.current.delete(old.id);
        });
        return next.slice(-MAX_VISIBLE);
      });
      if (input.variant !== "error") {
        timers.current.set(id, setTimeout(() => dismiss(id), DURATION_MS[input.variant]));
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-(--z-dialog) flex w-full max-w-sm flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            role={item.variant === "error" ? "alert" : "status"}
            className={cn(NB_SURFACE, VARIANT_CLASSES[item.variant], "pointer-events-auto flex items-start gap-3 p-3")}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{item.title}</p>
              {item.description ? <p className="mt-0.5 text-xs leading-relaxed">{item.description}</p> : null}
            </div>
            {item.variant === "error" ? (
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="shrink-0 rounded-nb-sm border-2 border-ink bg-surface px-2 py-0.5 font-mono text-2xs font-bold uppercase"
              >
                Cerrar
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const useToast = (): ToastApi => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast debe usarse dentro de ToastProvider.");
  return context;
};

export type { ToastInput, ToastVariant };
export { ToastProvider, useToast };
