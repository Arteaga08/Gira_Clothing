"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface CommandPaletteContextValue {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

/**
 * Owns whether the command palette is open. Split from the dialog itself
 * (`CommandPalette`, Tarea 9) so TopBar's search trigger and the ⌘K/Ctrl+K
 * global listener share one source of truth without either depending on the
 * dialog's implementation — clicking the trigger is meant to be exactly the
 * same event as the shortcut, not a lookalike.
 */
const CommandPaletteProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);

  return (
    <CommandPaletteContext.Provider value={{ open, openPalette, closePalette }}>
      {children}
    </CommandPaletteContext.Provider>
  );
};

const useCommandPalette = (): CommandPaletteContextValue => {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error("useCommandPalette debe usarse dentro de CommandPaletteProvider.");
  }
  return context;
};

export { CommandPaletteProvider, useCommandPalette };
