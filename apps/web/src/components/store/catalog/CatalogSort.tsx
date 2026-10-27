"use client";

import { CaretDown } from "@phosphor-icons/react";
import Link from "next/link";
import { useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { NB_SURFACE } from "@/components/ui/styles";
import { CATALOG_SORTS, catalogHref, withSort, type CatalogQuery } from "@/lib/store/catalogQuery";
import { cn } from "@/lib/cn";

interface CatalogSortProps {
  query: CatalogQuery;
  /** Products matching the filters (all pages). */
  total: number;
}

const countLabel = (total: number): string => (total === 1 ? "1 prenda" : `${total} prendas`);

/**
 * «Ordenar por» as the same collapsible island the panel uses: closed it shows
 * the current order and how many garments match; open, the five orders as
 * links (the order lives in the URL). Choosing one closes it. Closed, the
 * options are `inert`, so they are out of the tab order.
 */
const CatalogSort = ({ query, total }: CatalogSortProps) => {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const current = CATALOG_SORTS.find((option) => option.value === query.sort) ?? CATALOG_SORTS[0];

  return (
    <section aria-label="Ordenar" className={cn(NB_SURFACE, "overflow-hidden")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      >
        <Icon icon={CaretDown} size={18} className={cn("shrink-0 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xl uppercase leading-none">Ordenar por</span>
          <span className="mt-1 block font-mono text-xs font-bold uppercase text-text-muted">{current.label}</span>
        </span>
        <span className="shrink-0 font-mono text-xs font-bold uppercase">{countLabel(total)}</span>
      </button>
      <div id={bodyId} data-open={open} className="catalog-acc">
        <div className="overflow-hidden" inert={!open}>
          <ul className="flex flex-wrap gap-2.5 border-t-2 border-ink p-4">
            {CATALOG_SORTS.map((option) => {
              const active = option.value === query.sort;
              return (
                <li key={option.value}>
                  <Link
                    href={catalogHref(withSort(query, option.value))}
                    aria-current={active ? "true" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-bold shadow-nb-sm transition-[translate,box-shadow] hover:-translate-x-px hover:-translate-y-px hover:shadow-nb motion-reduce:transition-none",
                      active ? "bg-brand text-text-inverse" : "bg-cat-lilac-soft text-text-primary",
                    )}
                  >
                    {option.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
};

export type { CatalogSortProps };
export { CatalogSort };
