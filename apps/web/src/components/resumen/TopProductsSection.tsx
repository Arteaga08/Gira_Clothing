"use client";

import type { PeriodPreset, TopProduct, Wire } from "@gira/shared";
import { useState } from "react";
import { TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { fetchTopProductsForPeriod } from "@/lib/api/topProducts";
import { formatInteger } from "@/lib/format";
import { PeriodSelector } from "./PeriodSelector";
import { TopProductsBarChart } from "./TopProductsBarChart";

interface TopProductsSectionProps {
  initialProducts: readonly Wire<TopProduct>[];
  initialPeriod: PeriodPreset;
  className?: string | undefined;
}

const PERIOD_HINTS: Record<Exclude<PeriodPreset, "custom">, string> = {
  today: "Hoy",
  week: "Esta semana",
  month: "Este mes",
};

/**
 * Lives outside the page's `Promise.allSettled` on purpose: its period
 * selector (including an `<input type="date">`) changes without a page
 * navigation, so it manages its own fetch/loading/error state instead of
 * being fed once by the RSC parent — the same reasoning that makes
 * `NotificationBell`/`useOutboxHealth` client-side widgets.
 */
const TopProductsSection = ({ initialProducts, initialPeriod, className }: TopProductsSectionProps) => {
  const [period, setPeriod] = useState<PeriodPreset>(initialPeriod);
  const [fecha, setFecha] = useState<string | undefined>(undefined);
  const [products, setProducts] = useState<readonly Wire<TopProduct>[]>(initialProducts);
  const [error, setError] = useState(false);

  const handleChange = (nextPeriod: PeriodPreset, nextFecha?: string) => {
    setPeriod(nextPeriod);
    setFecha(nextFecha);
    setError(false);
    fetchTopProductsForPeriod(nextPeriod, nextFecha)
      .then((result) => setProducts(result.products))
      .catch(() => setError(true));
  };

  const hint = period === "custom" ? (fecha ? `Ventas del ${fecha}` : "Fecha específica") : PERIOD_HINTS[period];

  return (
    <Panel
      title="Más vendidos"
      hint={hint}
      actions={<PeriodSelector activePeriod={period} onChange={handleChange} />}
      flush
      className={className}
    >
      {error ? (
        <div className="p-4">
          <Notice variant="danger" title="No se pudo cargar esta sección">
            Intenta de nuevo o cambia el periodo.
          </Notice>
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={TrophyIcon}
          title="Sin ventas en este periodo"
          description="Cuando se vendan productos en este periodo aparecerán aquí."
        />
      ) : (
        <>
          <div className="border-b border-border p-4">
            <TopProductsBarChart products={products} />
          </div>
          <div>
            {products.map((product, index) => (
              <div
                key={product.sku}
                className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-nb-sm border-[1.5px] border-ink bg-surface-sunken font-mono text-xs font-bold">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {product.productName} · {product.printName}
                  </p>
                  <p className="font-mono text-xs text-text-muted">{product.sku}</p>
                </div>
                <span className="shrink-0 font-mono text-sm font-bold">
                  {formatInteger(product.units)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
};

export { TopProductsSection };
export type { TopProductsSectionProps };
