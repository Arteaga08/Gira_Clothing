import type { KeyboardEvent } from "react";
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
 * The row of names over the photo (tablist with a roving tabindex and arrow
 * keys). Hueso with an ink outline so they read on any photo; the selected one
 * is fully lit and underlined.
 */
const PrintTabs = ({ prints, activeIndex, panelId, onSelect, onKeyDown, register }: PrintTabsProps) => (
  <div
    role="tablist"
    aria-label="Estampas"
    onKeyDown={onKeyDown}
    style={{ ["--i" as string]: 1 }}
    className="reveal-item flex max-w-full gap-x-8 gap-y-4 overflow-x-auto px-2 pb-4 pt-1 md:flex-wrap md:justify-center md:gap-x-12"
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
          onClick={() => onSelect(position)}
          className="prints-tab font-display text-[clamp(1.75rem,5vw,3.25rem)] uppercase"
        >
          {print.name}
        </button>
      );
    })}
  </div>
);

export { PrintTabs };
