"use client";

import type { KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/** role="tablist" with arrow-key + Home/End navigation, per WAI-ARIA APG. */
const Tabs = ({ tabs, value, onChange, className }: TabsProps) => {
  const activeIndex = tabs.findIndex((tab) => tab.id === value);

  const focusAndSelect = (index: number, node: HTMLElement) => {
    const target = tabs[index];
    if (!target) return;
    onChange(target.id);
    const list = node.parentElement;
    const tabEl = list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index];
    tabEl?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const lastIndex = tabs.length - 1;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAndSelect(activeIndex === lastIndex ? 0 : activeIndex + 1, event.currentTarget);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAndSelect(activeIndex === 0 ? lastIndex : activeIndex - 1, event.currentTarget);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAndSelect(0, event.currentTarget);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAndSelect(lastIndex, event.currentTarget);
    }
  };

  return (
    <div role="tablist" className={cn("flex gap-2 overflow-x-auto pb-1", className)}>
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={handleKeyDown}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-nb-pill border-2 border-ink px-3 py-2 text-xs font-bold",
              selected ? "bg-ink text-text-inverse" : "bg-surface text-text-secondary",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="rounded-nb-pill bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-text-primary">
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

export type { TabItem, TabsProps };
export { Tabs };
