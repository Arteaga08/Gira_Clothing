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
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
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
/** Shown when a panel's own render throws (bad shape, unexpected value) —
 *  distinct from a fetch failure, which `SectionError` above already covers. */
const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

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
      ? sessionOutcome.value.user.firstName
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
        <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
          <KpiRow
            orders={overview.orders.period}
            inventory={{ unitsAvailable: overview.inventory.unitsAvailable }}
          />
        </ErrorBoundary>
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
          <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
            <TimeseriesChart
              series={timeseries.series}
              rangeDays={days}
              timezone={timeseries.range.timezone}
              granularity={timeseries.granularity}
            />
          </ErrorBoundary>
        ) : (
          <SectionError
            message={messageOf(
              timeseriesOutcome.status === "rejected" ? timeseriesOutcome.reason : undefined,
            )}
          />
        )}

        {topProductsPeriod ? (
          <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
            <TopProductsSection
              initialProducts={topProductsPeriod.products}
              initialPeriod={DEFAULT_TOP_PRODUCTS_PERIOD}
            />
          </ErrorBoundary>
        ) : (
          <SectionError
            message={messageOf(
              topProductsOutcome.status === "rejected" ? topProductsOutcome.reason : undefined,
            )}
          />
        )}

        {overview ? (
          <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
            <DistributionPanel byStatus={overview.orders.byStatus} />
          </ErrorBoundary>
        ) : (
          <SectionError message={GENERIC_SECTION_ERROR} />
        )}

        {overview ? (
          <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
            <LowStockPanel
              items={overview.inventory.lowStockItems}
              lowStockThreshold={overview.inventory.lowStockThreshold}
              outOfStock={overview.inventory.outOfStock}
              lowStock={overview.inventory.lowStock}
            />
          </ErrorBoundary>
        ) : (
          <SectionError message={GENERIC_SECTION_ERROR} />
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {overview ? (
          <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
            <TopPrintsPanel prints={overview.orders.period.topPrints} />
          </ErrorBoundary>
        ) : (
          <SectionError message={GENERIC_SECTION_ERROR} />
        )}

        {health ? (
          <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
            <OutboxHealthPanel health={health} />
          </ErrorBoundary>
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
