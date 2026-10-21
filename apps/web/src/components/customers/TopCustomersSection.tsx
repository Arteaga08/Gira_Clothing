"use client";

import { TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { CUSTOMER_RANK_SORTS, type CustomerRankPeriod, type CustomerRankSort } from "@gira/shared";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/SelectField";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { Tabs } from "@/components/ui/Tabs";
import { NB_TILE } from "./tileStyles";
import { useTopCustomers } from "@/hooks/useTopCustomers";
import { formatMxn } from "@/lib/coupons/money";
import type { CustomerFilters } from "@/lib/customers/filters";
import { customerFullName } from "@/lib/customers/panelCustomer";

interface TopCustomersSectionProps {
  filters: CustomerFilters;
  onPeriodChange: (period: CustomerRankPeriod) => void;
  onSortChange: (sortBy: CustomerRankSort) => void;
}

const PERIOD_TABS = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];
const SORT_OPTIONS = [
  { value: "spent", label: "Gasto neto" },
  { value: "orders", label: "Número de compras" },
];
const EMPTY_COPY: Record<CustomerRankPeriod, string> = {
  today: "Nadie ha completado una compra hoy.",
  week: "Nadie ha completado una compra desde el lunes.",
  month: "Nadie ha completado una compra en lo que va del mes.",
};
/** Podium tile fills by place; tokens only. */
const PODIUM_BG = ["bg-brand-subtle", "bg-tile-alt", "bg-accent-soft"] as const;
const PODIUM_SIZE = 3;

const isRankSort = (value: string): value is CustomerRankSort =>
  (CUSTOMER_RANK_SORTS as readonly string[]).includes(value);

const purchases = (count: number): string => `${count} ${count === 1 ? "compra" : "compras"}`;

/** «Mejores clientes»: the top 10 with an account, podium for the first three, rows for the rest. */
const TopCustomersSection = ({ filters, onPeriodChange, onSortChange }: TopCustomersSectionProps) => {
  const top = useTopCustomers(filters);
  const rows = top.ranking?.rows ?? [];

  return (
    <section className="flex flex-col gap-5" aria-label="Mejores clientes">
      <div className={`${NB_SURFACE} flex flex-wrap items-start justify-between gap-4 p-5`}>
        <div>
          <h2 className={T_PANEL_TITLE}>Mejores clientes</h2>
          <p className="text-sm text-text-muted">Clientes con cuenta. Gasto neto en pesos, sin reembolsos.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Tabs tabs={PERIOD_TABS} value={filters.period} onChange={(id) => onPeriodChange(id as CustomerRankPeriod)} />
          <SelectField
            label="Ordenar por"
            options={SORT_OPTIONS}
            value={filters.sortBy}
            onChange={(value) => {
              if (isRankSort(value)) onSortChange(value);
            }}
            containerClassName="min-w-52"
          />
        </div>
      </div>

      {top.status === "error" ? (
        <Notice variant="danger" title="No se pudo cargar el ranking">
          <p>{top.error}</p>
          <Button size="sm" className="mt-2" onClick={top.refresh}>
            Reintentar
          </Button>
        </Notice>
      ) : top.status === "loading" ? (
        <div className="grid gap-4 md:grid-cols-3" aria-busy="true">
          {Array.from({ length: PODIUM_SIZE }, (_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className={NB_SURFACE}>
          <EmptyState icon={TrophyIcon} title="Sin compras en este periodo" description={EMPTY_COPY[filters.period]} />
        </div>
      ) : (
        <>
          <ol className="grid gap-4 md:grid-cols-3" aria-label="Podio">
            {rows.slice(0, PODIUM_SIZE).map((row, index) => (
              <li key={row.id} className={`${NB_TILE} ${PODIUM_BG[index]} relative flex flex-col gap-3 p-5`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-4xl leading-none" aria-label={`Lugar ${index + 1}`}>
                    {index + 1}
                  </span>
                  <span className="rounded-nb-pill border-[1.5px] border-ink bg-surface px-2 py-0.5 font-mono text-2xs font-bold uppercase">
                    {purchases(row.orderCount)}
                  </span>
                </div>
                <Link
                  href={`/clientes/${row.id}`}
                  className="font-bold after:absolute after:inset-0 after:content-[''] hover:underline"
                >
                  {customerFullName(row)}
                </Link>
                <span className="break-all font-mono text-xs text-text-secondary">{row.email}</span>
                <span className="font-mono text-2xl font-bold">{formatMxn(row.spentMxn)}</span>
              </li>
            ))}
          </ol>
          {rows.length > PODIUM_SIZE ? (
            <ol className={`${NB_SURFACE} divide-y divide-border px-4`} start={PODIUM_SIZE + 1}>
              {rows.slice(PODIUM_SIZE).map((row, index) => (
                <li key={row.id} className="relative grid grid-cols-[2rem_1fr_auto] items-center gap-4 py-3 sm:grid-cols-[2rem_1fr_auto_auto]">
                  <span className="font-mono text-sm font-bold text-text-muted">{index + PODIUM_SIZE + 1}</span>
                  <Link
                    href={`/clientes/${row.id}`}
                    className="min-w-0 after:absolute after:inset-0 after:content-['']"
                  >
                    <span className="block font-bold">{customerFullName(row)}</span>
                    <span className="block truncate font-mono text-xs text-text-muted">{row.email}</span>
                  </Link>
                  <span className="hidden font-mono text-sm sm:block">{purchases(row.orderCount)}</span>
                  <span className="font-mono font-bold">{formatMxn(row.spentMxn)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
};

export type { TopCustomersSectionProps };
export { TopCustomersSection };
