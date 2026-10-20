"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Pagination } from "@/components/ui/Pagination";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { SlideOver } from "@/components/ui/SlideOver";
import { NB_SURFACE } from "@/components/ui/styles";
import { useInventoryCounts } from "@/hooks/useInventoryCounts";
import { useInventoryFilterOptions } from "@/hooks/useInventoryFilterOptions";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useStockActions } from "@/hooks/useStockActions";
import { useVariantList } from "@/hooks/useVariantList";
import { groupByCategory } from "@/lib/inventory/groupByCategory";
import {
  applyFilterPatch,
  hasActiveFilters,
  toSearchParams,
  type InventoryFilterPatch,
  type InventoryFilters as Filters,
} from "@/lib/inventory/filters";
import type { PanelVariant } from "@/lib/inventory/panelVariant";
import type { InventoryCounts } from "@/lib/inventory/stats";
import { CategoryGroup } from "./CategoryGroup";
import { InventoryEmpty } from "./InventoryEmpty";
import { InventoryFilters } from "./InventoryFilters";
import { InventoryTabs } from "./InventoryTabs";
import { VariantPreview, VariantPreviewPlaceholder } from "./VariantPreview";

interface InventoryPageProps {
  initialFilters: Filters;
  /** Read on the server for the first paint; null when that read failed (the client then retries). */
  initialCounts: InventoryCounts | null;
}

/**
 * The inventory workspace: tabs by stock state, filters in the URL, the rows
 * grouped by product category (closed on arrival), and a preview of the
 * selected variant with its adjustment form. A saved adjustment replaces the
 * row at once, then refreshes the list and the tab counts so "Agotado (2)"
 * never disagrees with the rows below it.
 */
const InventoryPage = ({ initialFilters, initialCounts }: InventoryPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const isDesktop = useIsDesktop();
  const [filters, setFilters] = useState(initialFilters);
  // URLs this component wrote itself: when the server hands them back as `initialFilters` they are
  // already applied. Any other change (sidebar link, dashboard shortcut, back/forward) is external and wins.
  const writtenUrls = useRef(new Set<string>());
  const seenInitial = useRef(toSearchParams(initialFilters));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The last variant picked or saved: it keeps the preview alive when the refreshed list no longer contains it
  // (an adjustment can move it out of the active tab).
  const [lastSelected, setLastSelected] = useState<PanelVariant | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // What the operator chose to open or close by hand; cleared whenever the filters change.
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [activityKey, setActivityKey] = useState(0);

  const updateFiltersRef = useRef<(patch: InventoryFilterPatch) => void>(() => {});
  const list = useVariantList(filters, undefined, (lastPage) => updateFiltersRef.current({ page: lastPage }));
  const { counts, refresh: refreshCounts } = useInventoryCounts(initialCounts);
  const options = useInventoryFilterOptions();
  const { refresh: refreshList, replaceVariant } = list;

  const handleAdjusted = useCallback(
    (variant: PanelVariant) => {
      replaceVariant(variant);
      setLastSelected(variant);
      refreshList();
      refreshCounts();
      setActivityKey((current) => current + 1);
    },
    [replaceVariant, refreshList, refreshCounts],
  );
  const actions = useStockActions(handleAdjusted);

  const updateFilters = useCallback(
    (patch: InventoryFilterPatch) => {
      const next = applyFilterPatch(filters, patch);
      setFilters(next);
      setToggled(new Map());
      const query = toSearchParams(next);
      writtenUrls.current.add(query);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );
  useEffect(() => {
    updateFiltersRef.current = updateFilters;
  });

  const incomingQuery = toSearchParams(initialFilters);
  useEffect(() => {
    if (seenInitial.current === incomingQuery) return;
    seenInitial.current = incomingQuery;
    if (writtenUrls.current.delete(incomingQuery)) return;
    setFilters(initialFilters);
    setToggled(new Map());
  }, [incomingQuery, initialFilters]);

  const threshold = counts?.threshold ?? null;
  const groups = useMemo(() => groupByCategory(list.variants, threshold ?? 0), [list.variants, threshold]);
  const autoOpen = hasActiveFilters(filters);
  const selected = useMemo(
    () =>
      list.variants.find((variant) => variant.id === selectedId) ??
      (lastSelected?.id === selectedId ? lastSelected : null),
    [list.variants, selectedId, lastSelected],
  );

  const isOpen = (groupId: string): boolean => toggled.get(groupId) ?? autoOpen;
  const toggleGroup = (groupId: string) =>
    setToggled((current) => new Map(current).set(groupId, !isOpen(groupId)));

  const selectVariant = (id: string) => {
    setSelectedId(id);
    setLastSelected(list.variants.find((variant) => variant.id === id) ?? null);
    if (!isDesktop) setSheetOpen(true);
  };

  const preview = selected ? (
    <VariantPreview
      variant={selected}
      threshold={threshold}
      busy={actions.isBusy(selected.id)}
      activityKey={activityKey}
      onAdjust={(variant, body) => actions.adjust(variant, body)}
    />
  ) : (
    <VariantPreviewPlaceholder />
  );

  return (
    <div className="flex flex-col gap-6">
      <InventoryTabs value={filters.stock} counts={counts} onChange={(stock) => updateFilters({ stock })} />
      <div className={`${NB_SURFACE} p-4`}>
        <InventoryFilters filters={filters} options={options} onChange={updateFilters} />
      </div>

      {list.status === "ready" && list.error ? (
        <Notice variant="warning" title="No se pudo actualizar la lista">
          <p>{list.error} Estás viendo la última lista cargada.</p>
          <Button size="sm" className="mt-2" onClick={refreshList}>
            Reintentar
          </Button>
        </Notice>
      ) : null}

      {list.status === "error" ? (
        <Notice variant="danger" title="No se pudo cargar el inventario">
          <p>{list.error}</p>
          <Button size="sm" className="mt-2" onClick={refreshList}>
            Reintentar
          </Button>
        </Notice>
      ) : list.status === "loading" ? (
        <div className="rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb" aria-busy="true">
          <SkeletonRows rows={5} cols={3} />
        </div>
      ) : groups.length === 0 ? (
        <div className={NB_SURFACE}>
          <InventoryEmpty filters={filters} />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <CategoryGroup
                key={group.id}
                group={group}
                threshold={threshold}
                open={isOpen(group.id)}
                onToggle={() => toggleGroup(group.id)}
                selectedId={selectedId}
                onSelect={selectVariant}
              />
            ))}
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
          </div>
          {isDesktop ? (
            <aside aria-label="Vista previa de la variante" className={`${NB_SURFACE} sticky top-4 p-6`}>
              {preview}
            </aside>
          ) : null}
        </div>
      )}

      {!isDesktop ? (
        <SlideOver
          open={sheetOpen && selected !== null}
          onClose={() => setSheetOpen(false)}
          title={selected ? selected.sku : "Variante"}
        >
          {preview}
        </SlideOver>
      ) : null}
    </div>
  );
};

export type { InventoryPageProps };
export { InventoryPage };
