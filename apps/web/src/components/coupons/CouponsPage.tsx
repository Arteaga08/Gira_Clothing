"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { useCouponList } from "@/hooks/useCouponList";
import {
  applyFilterPatch,
  DEFAULT_KIND,
  DEFAULT_SORT,
  DEFAULT_STATUS,
  toSearchParams,
  type CouponFilterPatch,
  type CouponFilters,
} from "@/lib/coupons/filters";
import { CouponEmpty } from "./CouponEmpty";
import { CouponFilters as CouponFiltersBar } from "./CouponFilters";
import { CouponModal } from "./CouponModal";
import { CouponTable } from "./CouponTable";
import { NewCouponButton } from "./NewCouponButton";

interface CouponsPageProps {
  /** Plain data from the server component: never a function or a config object. */
  initialFilters: CouponFilters;
  /** `"nuevo"` or a coupon id from the URL: the modal opens on load. */
  initialSelected?: string | undefined;
}

const SKELETON_ROWS = 5;

/**
 * The Cupones workspace: filters and the open coupon live in the URL, so a view
 * can be shared or reloaded. What this component writes itself is not
 * re-applied when the server hands it back; anything else (sidebar link,
 * back/forward) wins.
 */
const CouponsPage = ({ initialFilters, initialSelected }: CouponsPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const [selected, setSelected] = useState(initialSelected);
  const writtenUrls = useRef(new Set<string>());
  const seenInitial = useRef(toSearchParams(initialFilters, initialSelected));

  const writeUrl = useCallback(
    (nextFilters: CouponFilters, nextSelected: string | undefined) => {
      setFilters(nextFilters);
      setSelected(nextSelected);
      const query = toSearchParams(nextFilters, nextSelected);
      writtenUrls.current.add(query);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const updateFilters = useCallback(
    (patch: CouponFilterPatch) => writeUrl(applyFilterPatch(filters, patch), selected),
    [filters, selected, writeUrl],
  );
  const updateFiltersRef = useRef(updateFilters);
  useEffect(() => {
    updateFiltersRef.current = updateFilters;
  });

  const list = useCouponList(filters, (lastPage) => updateFiltersRef.current({ page: lastPage }));
  const { refresh } = list;

  const incomingQuery = toSearchParams(initialFilters, initialSelected);
  useEffect(() => {
    if (seenInitial.current === incomingQuery) return;
    seenInitial.current = incomingQuery;
    if (writtenUrls.current.delete(incomingQuery)) return;
    setFilters(initialFilters);
    setSelected(initialSelected);
  }, [incomingQuery, initialFilters, initialSelected]);

  const openCoupon = (id: string) => writeUrl(filters, id);
  const openNew = () => writeUrl(filters, "nuevo");
  const closeModal = () => writeUrl(filters, undefined);
  const clearFilters = () => updateFilters({ search: undefined, status: DEFAULT_STATUS, kind: DEFAULT_KIND, sort: DEFAULT_SORT });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cupones"
        subtitle="Descuentos de campaña y cupones personales. Solo aplican a clientes con cuenta."
        actions={<NewCouponButton onClick={openNew} />}
      />

      <div className={`${NB_SURFACE} p-4`}>
        <CouponFiltersBar filters={filters} onChange={updateFilters} />
        <p className="mt-3 text-xs text-text-secondary">Para dar uno personal, entra a la cuenta del cliente.</p>
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
        <Notice variant="danger" title="No se pudieron cargar los cupones">
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
          <CouponEmpty filters={filters} onClear={clearFilters} onCreate={openNew} />
        </div>
      ) : (
        <div className={`${NB_SURFACE} overflow-hidden`}>
          <CouponTable items={list.items} onOpen={openCoupon} />
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

      <CouponModal selected={selected} items={list.items} onClose={closeModal} onChanged={refresh} />
    </div>
  );
};

export type { CouponsPageProps };
export { CouponsPage };
