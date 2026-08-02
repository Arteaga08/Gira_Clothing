"use client";

import type { TimeseriesPoint, Wire } from "@gira/shared";
import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/cn";
import { formatInteger, formatShortDay } from "@/lib/format";
import { type ChartSeriesKind, toChartBars } from "@/lib/stats/chart";

interface TimeseriesChartProps {
  series: readonly Wire<TimeseriesPoint>[];
  rangeDays: number;
  timezone: string;
}

const SERIES_LABELS: Record<ChartSeriesKind, string> = {
  orders: "Pedidos",
  revenue: "Ingresos",
  units: "Unidades",
};

const TITLES: Record<ChartSeriesKind, string> = {
  orders: "Pedidos por día",
  revenue: "Ingresos por día",
  units: "Unidades por día",
};

/** Label every 5th bar plus the last one — matches the mockup's axis density. */
const AXIS_STEP = 5;

/**
 * Switching series never refetches: `timeseries` already returns `orders`,
 * `unitsSold` and `revenue[]` per point, so this is pure client state over
 * data the RSC parent already loaded. The range (`?dias=`), by contrast,
 * lives in the URL — that's a different control, `RangeSelector`.
 */
const TimeseriesChart = ({ series, rangeDays, timezone }: TimeseriesChartProps) => {
  const [kind, setKind] = useState<ChartSeriesKind>("orders");
  const { bars, summary } = toChartBars(series, kind);

  const ariaLabel = `${TITLES[kind]}, últimos ${rangeDays} días. Total ${summary.total}, máximo ${summary.max}.`;
  const seriesLegendLabel = kind === "revenue" ? "Ingresos MXN" : "Pedidos creados";

  return (
    <Panel
      title={TITLES[kind]}
      hint={`Últimos ${rangeDays} días · zona horaria ${timezone}`}
      actions={
        <div role="group" aria-label="Serie" className="flex gap-1">
          {(Object.keys(SERIES_LABELS) as ChartSeriesKind[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === kind}
              onClick={() => setKind(option)}
              className={cn(
                "rounded-nb-sm border-2 border-ink px-2.5 py-1 text-xs font-bold",
                option === kind ? "bg-brand text-text-inverse" : "bg-surface",
              )}
            >
              {SERIES_LABELS[option]}
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto">
        <div
          role="img"
          aria-label={ariaLabel}
          className="flex h-44 min-w-[34rem] items-end gap-[3px] pt-2 lg:h-52 lg:min-w-0"
        >
          {bars.map((bar) => (
            <span
              key={bar.day}
              data-bar
              data-zero={bar.isZero ? "true" : undefined}
              style={{ height: `${bar.heightPercent}%` }}
              className={cn(
                "relative min-w-[8px] flex-1 rounded-t-[4px] border-[1.5px] border-ink",
                bar.isZero ? "bg-[image:var(--pattern-zero-bar)]" : "bg-brand",
              )}
            />
          ))}
        </div>
        <div
          data-chart-axis
          aria-hidden="true"
          className="mt-2 flex min-w-[34rem] gap-[3px] font-mono text-[10px] text-text-muted lg:min-w-0"
        >
          {bars.map((bar, index) => {
            const isLabelled = index % AXIS_STEP === 0 || index === bars.length - 1;
            return (
              <span key={bar.day} className="min-w-[8px] flex-1 text-center">
                {isLabelled ? formatShortDay(bar.day) : ""}
              </span>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 border-t border-border pt-3 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] border-[1.5px] border-ink bg-brand" />
          {seriesLegendLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] border-[1.5px] border-ink bg-[image:var(--pattern-zero-bar)]" />
          Día sin pedidos
        </span>
        <span className="font-mono">
          Total {formatInteger(summary.total)} · Máx {formatInteger(summary.max)} · Prom{" "}
          {summary.average}/día
        </span>
      </div>
    </Panel>
  );
};

export { TimeseriesChart };
export type { TimeseriesChartProps };
