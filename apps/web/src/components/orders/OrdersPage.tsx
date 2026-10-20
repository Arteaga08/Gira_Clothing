"use client";

import { MAX_BULK_ORDERS } from "@gira/shared";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { Notice } from "@/components/ui/Notice";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { useOrderActions } from "@/hooks/useOrderActions";
import { useOrderList } from "@/hooks/useOrderList";
import { useOrderSummary } from "@/hooks/useOrderSummary";
import { applyFilterPatch, toSearchParams, type OrderFilterPatch, type OrderListFilters } from "@/lib/orders/filters";
import type { PanelOrder } from "@/lib/orders/panelOrder";
import type { OrderTabId } from "@/lib/orders/status";
import { BulkBar } from "./BulkBar";
import { OrderCard } from "./OrderCard";
import { OrderFilters } from "./OrderFilters";
import { OrderPreview } from "./OrderPreview";
import { OrderTabs } from "./OrderTabs";
import { OrdersEmpty } from "./OrdersEmpty";

interface OrdersPageProps {
  initialFilters: OrderListFilters;
}

/**
 * The orders workspace: tabs by status, filters in the URL, a list of cards,
 * and a preview of the selected one. Every action refreshes the list AND the
 * tab counters, so "Pagado (3)" never disagrees with the rows below it.
 */
const OrdersPage = ({ initialFilters }: OrdersPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  // URLs this component wrote itself: when the server hands them back as `initialFilters` they are
  // already applied. Any other change (sidebar link, breadcrumb, back/forward) is external and wins.
  const writtenUrls = useRef(new Set<string>());
  const seenInitial = useRef(toSearchParams(initialFilters));
  const [previewedId, setPreviewedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());

  const updateFiltersRef = useRef<(patch: OrderFilterPatch) => void>(() => {});
  const list = useOrderList(filters, undefined, (lastPage) => updateFiltersRef.current({ page: lastPage }));
  const summary = useOrderSummary();
  const { refresh: refreshList } = list;
  const { refresh: refreshSummary } = summary;

  const handleChanged = useCallback(() => {
    setChecked(new Set());
    refreshList();
    refreshSummary();
  }, [refreshList, refreshSummary]);
  const actions = useOrderActions(handleChanged);

  const updateFilters = useCallback(
    (patch: OrderFilterPatch) => {
      const next = applyFilterPatch(filters, patch);
      setFilters(next);
      setChecked(new Set());
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
    setChecked(new Set());
  }, [incomingQuery, initialFilters]);

  const changeTab = (tab: OrderTabId) => updateFilters({ tab });

  const previewed = useMemo<PanelOrder | undefined>(
    () => list.orders.find((order) => order.id === previewedId) ?? list.orders[0],
    [list.orders, previewedId],
  );

  const toggleChecked = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedOrders = list.orders.filter((order) => checked.has(order.id));
  const canSelectMore = checked.size < MAX_BULK_ORDERS;

  return (
    <div className="flex flex-col gap-6">
      <OrderTabs value={filters.tab} counts={summary.counts} onChange={changeTab} />
      <div className={`${NB_SURFACE} p-4`}>
        <OrderFilters filters={filters} onChange={updateFilters} />
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
        <Notice variant="danger" title="No se pudo cargar la lista">
          <p>{list.error}</p>
          <Button size="sm" className="mt-2" onClick={refreshList}>
            Reintentar
          </Button>
        </Notice>
      ) : list.status === "loading" ? (
        <div className="rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb" aria-busy="true">
          <SkeletonRows rows={6} cols={3} />
        </div>
      ) : list.orders.length === 0 ? (
        <div className="rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb">
          <OrdersEmpty filters={filters} />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="flex flex-col gap-3">
            {list.orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                previewed={previewed?.id === order.id}
                checked={checked.has(order.id)}
                selectable={canSelectMore}
                busy={actions.isBusy(order.id)}
                onPreview={() => setPreviewedId(order.id)}
                onToggleChecked={() => toggleChecked(order.id)}
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
          {previewed ? (
            <div className="hidden lg:block">
              <OrderPreview
                order={previewed}
                busy={actions.isBusy(previewed.id)}
                primaryAction={checked.size === 0}
                onPrepare={() => void actions.prepare(previewed)}
                onShip={() => void actions.ship(previewed)}
              />
            </div>
          ) : null}
        </div>
      )}

      <BulkBar
        count={checked.size}
        busy={actions.isBusy("bulk")}
        onClear={() => setChecked(new Set())}
        onPrepare={() => void actions.bulkPrepare(selectedOrders)}
      />
    </div>
  );
};

export type { OrdersPageProps };
export { OrdersPage };
