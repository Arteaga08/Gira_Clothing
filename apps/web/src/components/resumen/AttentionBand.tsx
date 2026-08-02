import { cn } from "@/lib/cn";
import type { AttentionLevel, AttentionTile } from "@/lib/stats/attention";

interface AttentionBandProps {
  tiles: AttentionTile[];
}

const LEVEL_CLASSES: Record<AttentionLevel, string> = {
  warn: "bg-[var(--status-pending_payment)]",
  danger: "bg-[var(--status-disputed)]",
  clear: "bg-surface-raised text-text-muted shadow-none",
};

/**
 * The only surface in the screen with `shadow-nb-lg`: this band is
 * deliberately heavier than every other card, because it's the first thing
 * that should catch the eye. Range-independent by design (see attention.ts)
 * — the hint says so, or the numbers here look inconsistent with the KPIs
 * below, which do respect `?dias=`.
 */
const AttentionBand = ({ tiles }: AttentionBandProps) => (
  <section
    aria-labelledby="banda-atencion"
    className="rounded-nb border-2 border-ink bg-surface shadow-nb-lg"
  >
    <header className="flex flex-wrap items-center gap-2 rounded-t-nb border-b-2 border-ink bg-ink px-4 py-3 text-text-inverse">
      <h2 id="banda-atencion" className="text-sm font-bold">
        Requiere atención
      </h2>
      <span className="text-xs opacity-80">Ahora mismo, sin importar el rango.</span>
    </header>
    <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => (
        <div
          key={tile.key}
          data-level={tile.level}
          className={cn(
            "rounded-nb-sm border-2 border-ink p-3 text-left",
            tile.level !== "clear" && "shadow-nb-sm",
            LEVEL_CLASSES[tile.level],
          )}
        >
          <p className="font-mono text-xl font-bold leading-none">{tile.count}</p>
          <p className="mt-2 text-xs font-semibold leading-tight">{tile.label}</p>
        </div>
      ))}
    </div>
  </section>
);

export { AttentionBand };
export type { AttentionBandProps };
