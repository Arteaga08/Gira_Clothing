"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface BreadcrumbLabelState {
  label: string | null;
  setLabel: (label: string | null) => void;
}

const BreadcrumbLabelContext = createContext<BreadcrumbLabelState | null>(null);

/** Lets a page name its own last crumb (the order number) without the shell knowing about orders. */
const BreadcrumbLabelProvider = ({ children }: { children: ReactNode }) => {
  const [label, setLabel] = useState<string | null>(null);
  const value = useMemo(() => ({ label, setLabel }), [label]);
  return <BreadcrumbLabelContext.Provider value={value}>{children}</BreadcrumbLabelContext.Provider>;
};

const useBreadcrumbLabel = (): string | null => useContext(BreadcrumbLabelContext)?.label ?? null;

/** Render inside a page: registers `label` for the last crumb and clears it on unmount. */
const BreadcrumbLabel = ({ label }: { label: string }) => {
  const context = useContext(BreadcrumbLabelContext);
  const setLabel = context?.setLabel;

  useEffect(() => {
    setLabel?.(label);
    return () => setLabel?.(null);
  }, [label, setLabel]);

  return null;
};

export { BreadcrumbLabelProvider, BreadcrumbLabel, useBreadcrumbLabel };
