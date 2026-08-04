import type { Metadata } from "next";
import { AttentionBand } from "@/components/resumen/AttentionBand";
import { DistributionPanel } from "@/components/resumen/DistributionPanel";
import { GranularitySelector } from "@/components/resumen/GranularitySelector";
import { KpiRow } from "@/components/resumen/KpiRow";
import { LowStockPanel } from "@/components/resumen/LowStockPanel";
import { OutboxHealthPanel } from "@/components/resumen/OutboxHealthPanel";
import { RangeSelector } from "@/components/resumen/RangeSelector";
import { SectionError } from "@/components/resumen/SectionError";
import { TimeseriesChart } from "@/components/resumen/TimeseriesChart";
import { TopPrintsPanel } from "@/components/resumen/TopPrintsPanel";
import { TopProductsSection } from "@/components/resumen/TopProductsSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { isApiError } from "@/lib/api/ApiError";
import { loadSession } from "@/lib/api/session";
import { getOutboxHealth, getOverview, getTimeseries } from "@/lib/api/stats";
import { getTopProductsForPeriod } from "@/lib/api/topProductsServer";
import { formatLongDate, greetingFor } from "@/lib/format";
import { attentionTilesFrom } from "@/lib/stats/attention";
import { parseGranularity, parseRangeDays } from "@/lib/stats/range";

const metadata: Metadata = { title: "Resumen" };

const GENERIC_SECTION_ERROR = "No se pudo conectar con el servidor. Intenta de nuevo.";

/** "Más vendidos" opens on "this week so far" — a calendar-anchored period
 *  independent of the `?dias=`/`?vista=` range the rest of the page uses. */
const DEFAULT_TOP_PRODUCTS_PERIOD = "week" as const;

/** Turns a settled rejection into the Spanish message SectionError shows — the API's own message when it's an ApiError, a generic fallback otherwise. */
const messageOf = (reason: unknown): string => (isApiError(reason) ? reason.message : GENERIC_SECTION_ERROR);

interface ResumenPageProps {
  searchParams: Promise<{ dias?: string | string[]; vista?: string | string[] }>;
}

/**
 * This is the file M7 left as a "known gap": `/resumen` is the login's
 * destination and the sidebar's first item, but until this page existed it
 * 404'd inside the shell. It fetches all three of its dependencies in
 * parallel with `Promise.allSettled` — a `Promise.all` would let the least
 * important endpoint (notifications health) blank the whole screen when it's
 * the one most likely to be flaky.
 */
const ResumenPage = async ({ searchParams }: ResumenPageProps) => {
  const { dias, vista } = await searchParams;
  const granularity = parseGranularity(vista);
  const days = parseRangeDays(dias, granularity);

  const [overviewOutcome, timeseriesOutcome, healthOutcome, sessionOutcome, topProductsOutcome] =
    await Promise.allSettled([
      getOverview(days),
      getTimeseries(days, granularity),
      getOutboxHealth(),
      loadSession(),
      getTopProductsForPeriod(DEFAULT_TOP_PRODUCTS_PERIOD),
    ]);

  const overview = overviewOutcome.status === "fulfilled" ? overviewOutcome.value : undefined;
  const timeseries = timeseriesOutcome.status === "fulfilled" ? timeseriesOutcome.value : undefined;
  const health = healthOutcome.status === "fulfilled" ? healthOutcome.value : undefined;
  const topProductsPeriod = topProductsOutcome.status === "fulfilled" ? topProductsOutcome.value : undefined;

  const adminName =
    sessionOutcome.status === "fulfilled" && sessionOutcome.value.kind === "authenticated"
      ? sessionOutcome.value.user.name
      : "Administrador";
  const now = new Date();

  const attentionTiles = attentionTilesFrom(overview?.orders.alerts, health);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Resumen"
        subtitle={`${greetingFor(now)}, ${adminName} · ${formatLongDate(now)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <GranularitySelector activeGranularity={granularity} />
            <RangeSelector activeDays={days} granularity={granularity} />
          </div>
        }
      />

      {attentionTiles.length > 0 ? <AttentionBand tiles={attentionTiles} /> : null}

      {overview ? (
        <KpiRow
          orders={overview.orders.period}
          inventory={{ unitsAvailable: overview.inventory.unitsAvailable }}
        />
      ) : (
        <SectionError
          message={messageOf(overviewOutcome.status === "rejected" ? overviewOutcome.reason : undefined)}
        />
      )}

      {/*
       * A flat 4-item grid, not two independent stacks: with a 2-column
       * template and CSS Grid's default row auto-flow, DOM order (chart,
       * topProducts, distribution, lowStock) alone produces the 2x2 pairing
       * Manuel asked for — chart/Más vendidos share row 1, Distribución/Stock
       * bajo share row 2 — and `align-items: stretch` (the initial value,
       * nothing to opt into) equalizes each row's height automatically.
       */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {timeseries ? (
          <TimeseriesChart
            series={timeseries.series}
            rangeDays={days}
            timezone={timeseries.range.timezone}
            granularity={timeseries.granularity}
          />
        ) : (
          <SectionError
            message={messageOf(
              timeseriesOutcome.status === "rejected" ? timeseriesOutcome.reason : undefined,
            )}
          />
        )}

        {topProductsPeriod ? (
          <TopProductsSection
            initialProducts={topProductsPeriod.products}
            initialPeriod={DEFAULT_TOP_PRODUCTS_PERIOD}
          />
        ) : (
          <SectionError
            message={messageOf(
              topProductsOutcome.status === "rejected" ? topProductsOutcome.reason : undefined,
            )}
          />
        )}

        {overview ? (
          <DistributionPanel byStatus={overview.orders.byStatus} />
        ) : (
          <SectionError message={GENERIC_SECTION_ERROR} />
        )}

        {overview ? (
          <LowStockPanel
            items={overview.inventory.lowStockItems}
            lowStockThreshold={overview.inventory.lowStockThreshold}
            outOfStock={overview.inventory.outOfStock}
            lowStock={overview.inventory.lowStock}
          />
        ) : (
          <SectionError message={GENERIC_SECTION_ERROR} />
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {overview ? (
          <TopPrintsPanel prints={overview.orders.period.topPrints} />
        ) : (
          <SectionError message={GENERIC_SECTION_ERROR} />
        )}

        {health ? (
          <OutboxHealthPanel health={health} />
        ) : (
          <SectionError
            message={messageOf(healthOutcome.status === "rejected" ? healthOutcome.reason : undefined)}
          />
        )}
      </div>
    </div>
  );
};

export { metadata };
export default ResumenPage;
