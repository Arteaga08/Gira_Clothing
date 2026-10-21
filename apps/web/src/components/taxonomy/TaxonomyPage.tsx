"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { useTaxonList } from "@/hooks/useTaxonList";
import { TAXON_PARAMS, taxonConfigFor, type TaxonKind } from "@/lib/taxonomy/config";
import {
  applyFilterPatch,
  DEFAULT_SORT,
  toSearchParams,
  type TaxonFilterPatch,
  type TaxonFilters,
} from "@/lib/taxonomy/filters";
import { NewTaxonButton } from "./NewTaxonButton";
import { TaxonEmpty } from "./TaxonEmpty";
import { TaxonFilters as TaxonFiltersBar } from "./TaxonFilters";
import { TaxonModal } from "./TaxonModal";
import { TaxonTable } from "./TaxonTable";

interface TaxonomyPageProps {
  /** A string, not the config: this component is rendered by a Server Component (see `taxonConfigFor`). */
  kind: TaxonKind;
  initialFilters: TaxonFilters;
  /** `"nueva"` or a record id from the URL: the modal opens on load. */
  initialSelected?: string | undefined;
}

const SKELETON_ROWS = 5;

/**
 * The Familias / Categorías workspace: filters and the open record live in the
 * URL, so a view can be shared or reloaded. Same discipline as Estampas: what
 * this component writes itself is not re-applied when the server hands it
 * back; anything else (sidebar link, back/forward) wins.
 */
const TaxonomyPage = ({ kind, initialFilters, initialSelected }: TaxonomyPageProps) => {
  const config = taxonConfigFor(kind);
  const param = TAXON_PARAMS[kind];
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const [selected, setSelected] = useState(initialSelected);
  const writtenUrls = useRef(new Set<string>());
  const seenInitial = useRef(toSearchParams(initialFilters, param, initialSelected));

  const writeUrl = useCallback(
    (nextFilters: TaxonFilters, nextSelected: string | undefined) => {
      setFilters(nextFilters);
      setSelected(nextSelected);
      const query = toSearchParams(nextFilters, param, nextSelected);
      writtenUrls.current.add(query);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [param, pathname, router],
  );

  const updateFilters = useCallback(
    (patch: TaxonFilterPatch) => writeUrl(applyFilterPatch(filters, patch), selected),
    [filters, selected, writeUrl],
  );
  const updateFiltersRef = useRef(updateFilters);
  useEffect(() => {
    updateFiltersRef.current = updateFilters;
  });

  const list = useTaxonList(config, filters, undefined, (lastPage) => updateFiltersRef.current({ page: lastPage }));
  const { refresh } = list;

  const incomingQuery = toSearchParams(initialFilters, param, initialSelected);
  useEffect(() => {
    if (seenInitial.current === incomingQuery) return;
    seenInitial.current = incomingQuery;
    if (writtenUrls.current.delete(incomingQuery)) return;
    setFilters(initialFilters);
    setSelected(initialSelected);
  }, [incomingQuery, initialFilters, initialSelected]);

  const openRecord = (id: string) => writeUrl(filters, id);
  const openNew = () => writeUrl(filters, "nueva");
  const closeModal = () => writeUrl(filters, undefined);
  const clearFilters = () => updateFilters({ search: undefined, status: "active", sort: DEFAULT_SORT });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        actions={<NewTaxonButton label={config.newLabel} onClick={openNew} />}
      />

      <div className={`${NB_SURFACE} p-4`}>
        <TaxonFiltersBar filters={filters} searchPlaceholder={config.searchPlaceholder} onChange={updateFilters} />
      </div>

      {list.status === "ready" && list.error ? (
        <Notice variant="warning" title="No se pudo actualizar la lista">
          <p>{list.error} Estás viendo la última lista cargada.</p>
          <Button size="sm" className="mt-2" onClick={refresh}>
            Reintentar
          </Button>
        </Notice>
      ) : null}

      {list.status === "error" ? (
        <Notice variant="danger" title={`No se pudieron cargar las ${config.title.toLowerCase()}`}>
          <p>{list.error}</p>
          <Button size="sm" className="mt-2" onClick={refresh}>
            Reintentar
          </Button>
        </Notice>
      ) : list.status === "loading" ? (
        <div className={`${NB_SURFACE} flex flex-col gap-3 p-4`} aria-busy="true">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : list.items.length === 0 ? (
        <div className={NB_SURFACE}>
          <TaxonEmpty config={config} filters={filters} onClear={clearFilters} onCreate={openNew} />
        </div>
      ) : (
        <div className={`${NB_SURFACE} overflow-hidden`}>
          <TaxonTable config={config} items={list.items} onOpen={openRecord} />
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

      <TaxonModal config={config} selected={selected} items={list.items} onClose={closeModal} onChanged={refresh} />
    </div>
  );
};

export type { TaxonomyPageProps };
export { TaxonomyPage };
