"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { useCategoryOptions } from "@/hooks/useCategoryOptions";
import { useProductList } from "@/hooks/useProductList";
import {
  applyFilterPatch,
  toSearchParams,
  type CatalogFilterPatch,
  type CatalogFilters,
} from "@/lib/catalog/filters";
import { groupProductsByCategory } from "@/lib/catalog/groupByCategory";
import { CategorySection } from "./CategorySection";
import { ProductEmpty } from "./ProductEmpty";
import { ProductFilters } from "./ProductFilters";

interface ProductsPageProps {
  initialFilters: CatalogFilters;
}

const SKELETON_CARDS = 6;

/**
 * The catalog workspace: filters in the URL, and the models as cards grouped
 * by category. Same URL discipline as Inventory: what this component writes
 * itself is not re-applied when the server hands it back; anything else
 * (sidebar link, back/forward) wins.
 */
const ProductsPage = ({ initialFilters }: ProductsPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const writtenUrls = useRef(new Set<string>());
  const seenInitial = useRef(toSearchParams(initialFilters));

  const updateFiltersRef = useRef<(patch: CatalogFilterPatch) => void>(() => {});
  const list = useProductList(filters, undefined, (lastPage) => updateFiltersRef.current({ page: lastPage }));
  const categories = useCategoryOptions();
  const { refresh } = list;

  const updateFilters = useCallback(
    (patch: CatalogFilterPatch) => {
      const next = applyFilterPatch(filters, patch);
      setFilters(next);
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
  }, [incomingQuery, initialFilters]);

  const groups = useMemo(() => groupProductsByCategory(list.products), [list.products]);
  const clearFilters = () => updateFilters({ category: undefined, search: undefined, status: "active" });

  return (
    <div className="flex flex-col gap-6">
      <div className={`${NB_SURFACE} p-4`}>
        <ProductFilters filters={filters} categories={categories} onChange={updateFilters} />
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
        <Notice variant="danger" title="No se pudo cargar el catálogo">
          <p>{list.error}</p>
          <Button size="sm" className="mt-2" onClick={refresh}>
            Reintentar
          </Button>
        </Notice>
      ) : list.status === "loading" ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]" aria-busy="true">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <Skeleton key={index} className="aspect-[4/5] w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className={NB_SURFACE}>
          <ProductEmpty filters={filters} onClear={clearFilters} />
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <CategorySection key={group.id} group={group} />
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
        </>
      )}
    </div>
  );
};

export type { ProductsPageProps };
export { ProductsPage };
