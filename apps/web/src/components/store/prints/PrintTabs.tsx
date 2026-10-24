"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import type { PublicPrintSummary } from "@/lib/api/storefront";

interface PrintTabsProps {
  prints: PublicPrintSummary[];
  activeIndex: number;
  panelId: string;
  onSelect: (position: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  register: (position: number) => (node: HTMLButtonElement | null) => void;
}

/**
 * Every print's name in one still row (tablist with a roving tabindex and
 * arrow keys). Each name reads solid on any photo; the selected one becomes a
 * hueso label with an ink border, so the state never hinges on a thin outline.
 * Wide screens spread the row across the section in equal columns, each name
 * centred in its own, so the middle one sits on the page's axis; on a phone it
 * scrolls sideways and keeps the selected name centred.
 */
const PrintTabs = ({ prints, activeIndex, panelId, onSelect, onKeyDown, register }: PrintTabsProps) => {
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    const tab = row.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!tab) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollTo({ left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
  }, [activeIndex]);

  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label="Estampas"
      onKeyDown={onKeyDown}
      style={{ ["--i" as string]: 1, ["--prints-count" as string]: prints.length }}
      className="prints-tabs reveal-item flex w-full gap-x-7 py-3 md:grid md:max-w-[90rem] md:grid-cols-[repeat(var(--prints-count),minmax(0,1fr))] md:justify-items-center md:gap-x-4"
    >
      {prints.map((print, position) => {
        const selected = position === activeIndex;
        return (
          <button
            key={print.id}
            ref={register(position)}
            type="button"
            role="tab"
            id={`print-tab-${print.slug}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            data-label={print.name}
            onClick={() => onSelect(position)}
            className="prints-tab font-display text-[clamp(1.5rem,2.6vw,2.5rem)] uppercase"
          >
            {print.name}
          </button>
        );
      })}
    </div>
  );
};

export { PrintTabs };
