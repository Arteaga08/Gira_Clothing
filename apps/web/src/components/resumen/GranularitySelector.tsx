import { STATS_GRANULARITIES, type StatsGranularity } from "@gira/shared";
import Link from "next/link";
import { DEFAULT_RANGE_BY_GRANULARITY } from "@/lib/stats/range";
import { cn } from "@/lib/cn";
import { NB_PRESSABLE, NB_SURFACE } from "@/components/ui/styles";

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
    {STATS_GRANULARITIES.map((granularity) => {
      const active = granularity === activeGranularity;
      const defaultDays = DEFAULT_RANGE_BY_GRANULARITY[granularity];
      return (
        <Link
          key={granularity}
          href={`/resumen?dias=${defaultDays}&vista=${granularity}`}
          aria-current={active ? "page" : undefined}
          className={cn(
            NB_SURFACE,
            NB_PRESSABLE,
            "px-3 py-1.5 text-xs font-bold",
            active && "bg-brand text-text-inverse",
          )}
        >
          {LABELS[granularity]}
        </Link>
      );
    })}
  </div>
);

export { GranularitySelector };
export type { GranularitySelectorProps };
