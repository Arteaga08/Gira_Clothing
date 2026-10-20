"use client";

import { useSyncExternalStore } from "react";

/** Tailwind's `lg`: the breakpoint where the inventory preview pane is fixed beside the list. */
const DESKTOP_QUERY = "(min-width: 1024px)";

const subscribe = (notify: () => void): (() => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

const getSnapshot = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches;

/** False on the server and while hydrating: the page then renders the mobile layout and upgrades after mount. */
const useIsDesktop = (): boolean => useSyncExternalStore(subscribe, getSnapshot, () => false);

export { useIsDesktop };
