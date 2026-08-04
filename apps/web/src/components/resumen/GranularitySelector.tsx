import { STATS_GRANULARITIES, type StatsGranularity } from "@gira/shared";
import { Segmented } from "@/components/ui/Segmented";
import { DEFAULT_RANGE_BY_GRANULARITY } from "@/lib/stats/range";

interface GranularitySelectorProps {
  activeGranularity: StatsGranularity;
}

const LABELS: Record<StatsGranularity, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
  year: "Año",
};

/**
 * A granularity change re-buckets on the server (statsBucketing.ts), so this
 * lives in the URL exactly like `RangeSelector` — but switching `vista` also
 * has to move `dias` to a range that's valid for the NEW granularity (day's
 * `30` is not one of week's `[90, 180, 365]`), or the destination page would
 * silently clamp to a default that doesn't match what the link showed.
 */
const GranularitySelector = ({ activeGranularity }: GranularitySelectorProps) => (
  <div role="group" aria-label="Vista" className="flex gap-2">
    {STATS_GRANULARITIES.map((granularity) => (
      <Segmented
        key={granularity}
        href={`/resumen?dias=${DEFAULT_RANGE_BY_GRANULARITY[granularity]}&vista=${granularity}`}
        selected={granularity === activeGranularity}
      >
        {LABELS[granularity]}
      </Segmented>
    ))}
  </div>
);

export { GranularitySelector };
export type { GranularitySelectorProps };
