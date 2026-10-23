"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { useFamilyOptions } from "@/hooks/useFamilyOptions";
import { usePrintList } from "@/hooks/usePrintList";
import {
  applyFilterPatch,
  DEFAULT_SORT,
  toSearchParams,
  type PrintFilterPatch,
  type PrintFilters,
} from "@/lib/prints/filters";
import { NewPrintButton } from "./NewPrintButton";
import { PrintCard } from "./PrintCard";
import { PrintEmpty } from "./PrintEmpty";
import { PrintFilters as PrintFiltersBar } from "./PrintFilters";
import { PrintSlideOver } from "./PrintSlideOver";

interface PrintsPageProps {
  initialFilters: PrintFilters;
  /** `"nueva"` or a print id from `?estampa=`: the side panel opens on load. */
  initialSelected?: string | undefined;
}

const SKELETON_CARDS = 8;
const GRID = "grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]";

/**
 * The Estampas workspace: filters and the open print live in the URL, so a view
 * can be shared or reloaded. Same discipline as Productos: what this component
 * writes itself is not re-applied when the server hands it back; anything else
 * (sidebar link, back/forward) wins.
 */
const PrintsPage = ({ initialFilters, initialSelected }: PrintsPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const [selected, setSelected] = useState(initialSelected);
  const writtenUrls = useRef(new Set<string>());
  const seenInitial = useRef(toSearchParams(initialFilters, initialSelected));

  const writeUrl = useCallback(
    (nextFilters: PrintFilters, nextSelected: string | undefined) => {
      setFilters(nextFilters);
      setSelected(nextSelected);
      const query = toSearchParams(nextFilters, nextSelected);
      writtenUrls.current.add(query);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const updateFilters = useCallback(
    (patch: PrintFilterPatch) => writeUrl(applyFilterPatch(filters, patch), selected),
    [filters, selected, writeUrl],
  );
  const updateFiltersRef = useRef(updateFilters);
  useEffect(() => {
    updateFiltersRef.current = updateFilters;
  });

  const list = usePrintList(filters, undefined, (lastPage) => updateFiltersRef.current({ page: lastPage }));
  const families = useFamilyOptions();
  const { refresh } = list;

  const incomingQuery = toSearchParams(initialFilters, initialSelected);
  useEffect(() => {
    if (seenInitial.current === incomingQuery) return;
    seenInitial.current = incomingQuery;
    if (writtenUrls.current.delete(incomingQuery)) return;
    setFilters(initialFilters);
    setSelected(initialSelected);
  }, [incomingQuery, initialFilters, initialSelected]);

  const openPrint = (id: string) => writeUrl(filters, id);
  const openNew = () => writeUrl(filters, "nueva");
  const closePanel = () => writeUrl(filters, undefined);
  const clearFilters = () => updateFilters({ family: undefined, search: undefined, status: "active", sort: DEFAULT_SORT });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Estampas"
        subtitle="Las estampas que dan vida a cada modelo."
        actions={<NewPrintButton onClick={openNew} />}
      />

      <div className={`${NB_SURFACE} p-4`}>
        <PrintFiltersBar filters={filters} families={families} onChange={updateFilters} />
      </div>

      {list.status === "ready" && list.error ? (
        <Notice variant="warning" title="No se pudo actualizar la lista">
          <p>{list.error} Estás viendo la última lista cargada.</p>
          <Button variant="positive" size="sm" className="mt-2" onClick={refresh}>
            Reintentar
          </Button>
        </Notice>
      ) : null}

      {list.status === "error" ? (
        <Notice variant="danger" title="No se pudieron cargar las estampas">
          <p>{list.error}</p>
          <Button variant="positive" size="sm" className="mt-2" onClick={refresh}>
            Reintentar
          </Button>
        </Notice>
      ) : list.status === "loading" ? (
        <div className={GRID} aria-busy="true">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <Skeleton key={index} className="aspect-[4/5] w-full" />
          ))}
        </div>
      ) : list.prints.length === 0 ? (
        <div className={NB_SURFACE}>
          <PrintEmpty filters={filters} onClear={clearFilters} onCreate={openNew} />
        </div>
      ) : (
        <>
          <ul className={GRID} aria-label="Estampas">
            {list.prints.map((print) => (
              <li key={print.id} className="contents">
                <PrintCard print={print} onOpen={openPrint} />
              </li>
            ))}
          </ul>
          {list.meta ? (
            <div className={`${NB_SURFACE} px-4 py-3`}>
              <Pagination
                page={list.meta.page}
                limit={list.meta.limit}
                total={list.meta.total}
                onPageChange={(page) => updateFilters({ page })}
                className="mt-0"
              />
            </div>
          ) : null}
        </>
      )}

      <PrintSlideOver
        selected={selected}
        prints={list.prints}
        families={families}
        onClose={closePanel}
        onChanged={refresh}
      />
    </div>
  );
};

export type { PrintsPageProps };
export { PrintsPage };
