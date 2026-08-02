import Link from "next/link";
import { RANGE_OPTIONS, type RangeDays } from "@/lib/stats/range";
import { cn } from "@/lib/cn";
import { NB_PRESSABLE, NB_SURFACE } from "@/components/ui/styles";

interface RangeSelectorProps {
  activeDays: RangeDays;
}

/**
 * The mockup uses `<button aria-pressed>`, but the range lives in the URL
 * here (deep-link, back/forward, zero client state) — for a real link the
 * honest ARIA attribute is `aria-current`, not `aria-pressed`.
 */
const RangeSelector = ({ activeDays }: RangeSelectorProps) => (
  <div role="group" aria-label="Rango del periodo" className="flex gap-2">
    {RANGE_OPTIONS.map((days) => {
      const active = days === activeDays;
      return (
        <Link
          key={days}
          href={`/resumen?dias=${days}`}
          aria-current={active ? "page" : undefined}
          className={cn(
            NB_SURFACE,
            NB_PRESSABLE,
            "px-3 py-1.5 text-xs font-bold",
            active && "bg-brand text-text-inverse",
          )}
        >
          {days} d
        </Link>
      );
    })}
  </div>
);

export { RangeSelector };
export type { RangeSelectorProps };
