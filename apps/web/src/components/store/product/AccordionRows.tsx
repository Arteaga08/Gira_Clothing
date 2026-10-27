"use client";

import { useId, useState, type ReactNode } from "react";
import { CaretDown, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

interface AccordionRow {
  key: string;
  label: string;
  icon: PhosphorIcon;
  content: ReactNode;
}

interface AccordionRowsProps {
  rows: AccordionRow[];
  /** The row that starts open; without it every row starts closed. */
  defaultOpenKey?: string;
}

/**
 * Accordion rows of the product page. Each opens and closes on its own; the
 * height animates through `grid-template-rows` (0fr to 1fr), never `height`.
 */
const AccordionRows = ({ rows, defaultOpenKey }: AccordionRowsProps) => {
  const baseId = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(defaultOpenKey ? [defaultOpenKey] : []));

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="border-t-2 border-ink">
      {rows.map((row) => {
        const RowIcon = row.icon;
        const expanded = open.has(row.key);
        const buttonId = `${baseId}-${row.key}`;
        const panelId = `${baseId}-panel-${row.key}`;
        return (
          <div key={row.key} className="border-b-2 border-ink">
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(row.key)}
                className="flex w-full cursor-pointer items-center gap-3 py-4 text-left text-base font-bold text-text-primary"
              >
                <RowIcon size={22} weight="bold" aria-hidden="true" className="shrink-0" />
                <span className="flex-1">{row.label}</span>
                <CaretDown
                  size={18}
                  weight="bold"
                  aria-hidden="true"
                  className={cn("shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none", expanded && "rotate-180")}
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="pb-5 pl-9">{row.content}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export type { AccordionRow, AccordionRowsProps };
export { AccordionRows };
