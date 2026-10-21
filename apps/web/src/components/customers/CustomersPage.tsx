"use client";

import { MagnifyingGlassIcon, UsersIcon } from "@phosphor-icons/react/dist/ssr";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { useCustomerList } from "@/hooks/useCustomerList";
import {
  applyFilterPatch,
  toSearchParams,
  type CustomerFilterPatch,
  type CustomerFilters,
} from "@/lib/customers/filters";
import { CustomerSearch } from "./CustomerSearch";
import { CustomerTable } from "./CustomerTable";
import { TopCustomersSection } from "./TopCustomersSection";

interface CustomersPageProps {
  /** Plain data from the server component: never a function or a config object. */
  initialFilters: CustomerFilters;
}

const SKELETON_ROWS = 5;

/**
 * The Clientes workspace: filters live in the URL, so a view can be shared or reloaded.
 * What this component writes itself is not re-applied when the server hands it back;
 * anything else (sidebar link, back/forward) wins.
 */
const CustomersPage = ({ initialFilters }: CustomersPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const writtenUrls = useRef(new Set<string>());
  const seenInitial = useRef(toSearchParams(initialFilters));

  const writeUrl = useCallback(
    (next: CustomerFilters) => {
      setFilters(next);
      const query = toSearchParams(next);
      writtenUrls.current.add(query);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const updateFilters = useCallback(
    (patch: CustomerFilterPatch) => writeUrl(applyFilterPatch(filters, patch)),
    [filters, writeUrl],
  );
  const updateFiltersRef = useRef(updateFilters);
  useEffect(() => {
    updateFiltersRef.current = updateFilters;
  });

  const list = useCustomerList(filters, (lastPage) => updateFiltersRef.current({ page: lastPage }));

  const incomingQuery = toSearchParams(initialFilters);
  useEffect(() => {
    if (seenInitial.current === incomingQuery) return;
    seenInitial.current = incomingQuery;
    if (writtenUrls.current.delete(incomingQuery)) return;
    setFilters(initialFilters);
  }, [incomingQuery, initialFilters]);

  const onSearch = useCallback((search: string | undefined) => updateFiltersRef.current({ search }), []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Clientes" subtitle="Quién compra más y a quién darle un detalle." />

      <TopCustomersSection
        filters={filters}
        onPeriodChange={(period) => updateFilters({ period })}
        onSortChange={(sortBy) => updateFilters({ sortBy })}
      />

      <section className={`${NB_SURFACE} flex flex-col gap-4 p-5`} aria-label="Todos los clientes">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className={T_PANEL_TITLE}>Todos los clientes</h2>
            <p className="text-sm text-text-muted">Cuentas de clientes. Entra a una para darle un cupón.</p>
          </div>
          <CustomerSearch value={filters.search} onChange={onSearch} />
        </div>

        {list.status === "ready" && list.error ? (
          <Notice variant="warning" title="No se pudo actualizar la lista">
            <p>{list.error} Estás viendo la última lista cargada.</p>
            <Button size="sm" className="mt-2" onClick={list.refresh}>
              Reintentar
            </Button>
          </Notice>
        ) : null}

        {list.status === "error" ? (
          <Notice variant="danger" title="No se pudieron cargar los clientes">
            <p>{list.error}</p>
            <Button size="sm" className="mt-2" onClick={list.refresh}>
              Reintentar
            </Button>
          </Notice>
        ) : list.status === "loading" ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : list.items.length === 0 ? (
          filters.search ? (
            <EmptyState
              icon={MagnifyingGlassIcon}
              title="Sin resultados"
              description="Ningún cliente coincide con esa búsqueda."
              action={
                <Button size="sm" onClick={() => updateFilters({ search: undefined })}>
                  Limpiar búsqueda
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={UsersIcon}
              title="Todavía no hay clientes"
              description="Aquí aparecerán las cuentas en cuanto alguien se registre."
            />
          )
        ) : (
          <div className="overflow-hidden rounded-nb-sm border-2 border-ink">
            <CustomerTable items={list.items} />
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
      </section>
    </div>
  );
};

export type { CustomersPageProps };
export { CustomersPage };
