"use client";

import type { StatsGranularity, TimeseriesPoint, Wire } from "@gira/shared";
import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/cn";
import { formatInteger, formatPeriodLabel } from "@/lib/format";
import { type ChartSeriesKind, toChartBars } from "@/lib/stats/chart";

interface TimeseriesChartProps {
  series: readonly Wire<TimeseriesPoint>[];
  rangeDays: number;
  timezone: string;
  granularity?: StatsGranularity;
  className?: string | undefined;
}

const SERIES_LABELS: Record<ChartSeriesKind, string> = {
  orders: "Pedidos",
  revenue: "Ingresos",
  units: "Unidades",
};

/** "por día" / "por semana" / "por mes" / "por año", appended to the active series label. */
const GRANULARITY_NOUN: Record<StatsGranularity, string> = {
  day: "día",
  week: "semana",
  month: "mes",
  year: "año",
};

/** "Día sin pedidos" / "Semana sin pedidos" / … for the zero-bucket legend swatch. */
const ZERO_LABEL: Record<StatsGranularity, string> = {
  day: "Día sin pedidos",
  week: "Semana sin pedidos",
  month: "Mes sin pedidos",
  year: "Año sin pedidos",
};

/** Label every 5th bar plus the last one — matches the mockup's axis density. */
const AXIS_STEP = 5;

/**
 * Switching series never refetches: `timeseries` already returns `orders`,
 * `unitsSold` and `revenue[]` per point, so this is pure client state over
 * data the RSC parent already loaded. Range (`?dias=`) and view
 * (`?vista=`), by contrast, live in the URL — those are `RangeSelector` and
 * `GranularitySelector`.
 */
const TimeseriesChart = ({
  series,
  rangeDays,
  timezone,
  granularity = "day",
  className,
}: TimeseriesChartProps) => {
  const [kind, setKind] = useState<ChartSeriesKind>("orders");
  const { bars, summary } = toChartBars(series, kind);

  const title = `${SERIES_LABELS[kind]} por ${GRANULARITY_NOUN[granularity]}`;
  const ariaLabel = `${title}, últimos ${rangeDays} días. Total ${summary.total}, máximo ${summary.max}.`;
  const seriesLegendLabel = kind === "revenue" ? "Ingresos MXN" : "Pedidos creados";

  return (
    <Panel
      title={title}
      hint={`Últimos ${rangeDays} días · zona horaria ${timezone}`}
      className={className}
      actions={
        <div role="group" aria-label="Serie" className="flex gap-2">
          {(Object.keys(SERIES_LABELS) as ChartSeriesKind[]).map((option) => (
            <Segmented key={option} selected={option === kind} onClick={() => setKind(option)}>
              {SERIES_LABELS[option]}
            </Segmented>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto">
        <div role="img" aria-label={ariaLabel} className="flex h-44 items-end gap-[3px] pt-2 lg:h-52">
          {bars.map((bar) => (
            <span
              key={bar.periodStart}
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
          className="mt-2 flex gap-[3px] font-mono text-[10px] text-text-muted"
        >
          {bars.map((bar, index) => {
            const isLabelled = index % AXIS_STEP === 0 || index === bars.length - 1;
            return (
              <span key={bar.periodStart} className="min-w-[8px] flex-1 text-center">
                {isLabelled ? formatPeriodLabel(bar.periodStart, granularity) : ""}
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
          {ZERO_LABEL[granularity]}
        </span>
        <span className="font-mono">
          Total {formatInteger(summary.total)} · Máx {formatInteger(summary.max)} · Prom{" "}
          {summary.average}/{GRANULARITY_NOUN[granularity]}
        </span>
      </div>
    </Panel>
  );
};

export { TimeseriesChart };
export type { TimeseriesChartProps };
