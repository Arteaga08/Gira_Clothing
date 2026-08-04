import type { StatsGranularity } from "@gira/shared";
import { Segmented } from "@/components/ui/Segmented";
import { rangeOptionsFor } from "@/lib/stats/range";

interface RangeSelectorProps {
  activeDays: number;
  granularity: StatsGranularity;
}

/**
 * The mockup uses `<button aria-pressed>`, but the range lives in the URL
 * here (deep-link, back/forward, zero client state) — for a real link the
 * honest ARIA attribute is `aria-current`, not `aria-pressed`. Options
 * change with `granularity` (day bars stop being legible past ~90; a year of
 * weekly bars is still ~52) — `vista` always rides along in the href so
 * switching the range never silently resets the selected view.
 */
const RangeSelector = ({ activeDays, granularity }: RangeSelectorProps) => (
  <div role="group" aria-label="Rango del periodo" className="flex gap-2">
    {rangeOptionsFor(granularity).map((days) => (
      <Segmented key={days} href={`/resumen?dias=${days}&vista=${granularity}`} selected={days === activeDays}>
        {days} d
      </Segmented>
    ))}
  </div>
);

export { RangeSelector };
export type { RangeSelectorProps };
