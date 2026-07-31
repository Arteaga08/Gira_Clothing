"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useCommandPalette } from "./CommandPaletteProvider";

const CommandPaletteDialog = dynamic(
  () => import("./CommandPalette").then((mod) => mod.CommandPalette),
  { ssr: false },
);

/**
 * Owns the global ⌘K/Ctrl+K listener and the lazy load of the dialog itself.
 * `next/dynamic({ ssr: false })` is only valid inside a Client Component —
 * that's the reason this file exists separately from `AdminShell`, which is
 * a Server Component.
 */
const CommandPaletteMount = () => {
  const { openPalette } = useCommandPalette();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openPalette]);

  return <CommandPaletteDialog />;
};

export { CommandPaletteMount };
