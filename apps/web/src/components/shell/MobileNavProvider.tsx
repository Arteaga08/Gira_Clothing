"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface MobileNavContextValue {
  open: boolean;
  openNav: () => void;
  closeNav: () => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

/**
 * Owns the drawer's open state and closes it on every route change — a
 * client-side navigation triggered from inside the drawer would otherwise
 * leave it open behind the new page. Closing on a pathname change is state
 * adjusted during render (React's recommended pattern for "reset state when
 * a prop changes"), not an effect: a `setState` synchronous in an effect
 * body causes an extra cascading render for no benefit here.
 */
const MobileNavProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [renderedPathname, setRenderedPathname] = useState<string | null>(null);
  const pathname = usePathname();

  if (pathname !== renderedPathname) {
    setRenderedPathname(pathname);
    setOpen(false);
  }

  const openNav = useCallback(() => setOpen(true), []);
  const closeNav = useCallback(() => setOpen(false), []);

  return (
    <MobileNavContext.Provider value={{ open, openNav, closeNav }}>{children}</MobileNavContext.Provider>
  );
};

const useMobileNav = (): MobileNavContextValue => {
  const context = useContext(MobileNavContext);
  if (!context) {
    throw new Error("useMobileNav debe usarse dentro de MobileNavProvider.");
  }
  return context;
};

export { MobileNavProvider, useMobileNav };
