"use client";

import { useRef, useState, type KeyboardEvent } from "react";

/**
 * Selection state for a tablist of prints: one active index, a roving
 * tabindex and arrow keys that move focus and select (automatic activation, no
 * animation on the keyboard path beyond the crossfade itself).
 */
const usePrintSelection = (count: number) => {
  const [index, setIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (next: number, focus = false) => {
    const wrapped = (next + count) % count;
    setIndex(wrapped);
    if (focus) tabs.current[wrapped]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step !== undefined) select(index + step, true);
    else if (event.key === "Home") select(0, true);
    else if (event.key === "End") select(count - 1, true);
    else return;
    event.preventDefault();
  };

  const register = (position: number) => (node: HTMLButtonElement | null) => {
    tabs.current[position] = node;
  };

  return { index, select, onKeyDown, register };
};

export { usePrintSelection };
