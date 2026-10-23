"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { useAuditList } from "@/hooks/useAuditList";
import {
  applyFilterPatch,
  DEFAULT_ACTOR,
  DEFAULT_PERIOD,
  toSearchParams,
  type AuditFilterPatch,
  type AuditFilters,
} from "@/lib/audit/filters";
import { AuditEmpty } from "./AuditEmpty";
import { AuditFilters as AuditFiltersBar } from "./AuditFilters";
import { AuditLogModal } from "./AuditLogModal";
import { AuditTable } from "./AuditTable";

interface AuditPageProps {
  /** Plain data from the server component: never a function or a config object. */
  initialFilters: AuditFilters;
  /** Entry id from `?registro=`: its modal opens on load. */
  initialSelected?: string | undefined;
}

const SKELETON_ROWS = 6;

/**
 * Auditoría: the read-only trail of what admins and the system did. Filters
 * and the open entry live in the URL; what this component wrote itself is not
 * re-applied when the server hands it back, anything else (back/forward, a
 * pasted link) wins.
 */
const AuditPage = ({ initialFilters, initialSelected }: AuditPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const [selected, setSelected] = useState(initialSelected);
  const writtenUrls = useRef(new Set<string>());
  const seenInitial = useRef(toSearchParams(initialFilters, initialSelected));

  const writeUrl = useCallback(
    (nextFilters: AuditFilters, nextSelected: string | undefined) => {
      setFilters(nextFilters);
      setSelected(nextSelected);
      const query = toSearchParams(nextFilters, nextSelected);
      writtenUrls.current.add(query);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const updateFilters = useCallback(
    (patch: AuditFilterPatch) => writeUrl(applyFilterPatch(filters, patch), selected),
    [filters, selected, writeUrl],
  );
  const updateFiltersRef = useRef(updateFilters);
  useEffect(() => {
    updateFiltersRef.current = updateFilters;
  });

  const list = useAuditList(filters, (lastPage) => updateFiltersRef.current({ page: lastPage }));

  const incomingQuery = toSearchParams(initialFilters, initialSelected);
  useEffect(() => {
    if (seenInitial.current === incomingQuery) return;
    seenInitial.current = incomingQuery;
    if (writtenUrls.current.delete(incomingQuery)) return;
    setFilters(initialFilters);
    setSelected(initialSelected);
  }, [incomingQuery, initialFilters, initialSelected]);

  const clearFilters = () =>
    updateFilters({ actor: DEFAULT_ACTOR, module: undefined, action: undefined, period: DEFAULT_PERIOD });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Auditoría"
        subtitle="Quién hizo qué y cuándo. Solo lectura: los registros no se editan ni se borran."
      />

      <div className={`${NB_SURFACE} p-4`}>
        <AuditFiltersBar filters={filters} onChange={updateFilters} />
      </div>

      {list.status === "error" ? (
        <Notice variant="danger" title="No se pudo cargar la auditoría">
          <p>{list.error}</p>
          <Button variant="positive" size="sm" className="mt-2" onClick={list.refresh}>
            Reintentar
          </Button>
        </Notice>
      ) : list.status === "loading" ? (
        <div className={`${NB_SURFACE} flex flex-col gap-3 p-4`} aria-busy="true">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : list.items.length === 0 ? (
        <div className={NB_SURFACE}>
          <AuditEmpty filters={filters} onClear={clearFilters} />
        </div>
      ) : (
        <div className={`${NB_SURFACE} overflow-hidden`}>
          <AuditTable items={list.items} onOpen={(id) => writeUrl(filters, id)} />
          {list.meta ? (
            <div className="border-t-2 border-ink px-4 py-2">
              <Pagination
                page={list.meta.page}
                limit={list.meta.limit}
                total={list.meta.total}
                onPageChange={(page) => updateFilters({ page })}
                className="mt-0"
              />
            </div>
          ) : null}
        </div>
      )}

      <AuditLogModal selected={selected} items={list.items} onClose={() => writeUrl(filters, undefined)} />
    </div>
  );
};

export type { AuditPageProps };
export { AuditPage };
