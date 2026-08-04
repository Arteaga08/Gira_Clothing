import { MetricTile } from "@/components/ui/MetricTile";
import { NB_SURFACE } from "@/components/ui/styles";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import type { AttentionTile } from "@/lib/stats/attention";

interface AttentionBandProps {
  tiles: AttentionTile[];
}

/**
 * The only surface in the screen with `shadow-nb-lg`: this band is
 * deliberately heavier than every other card, because it's the first thing
 * that should catch the eye. Range-independent by design (see attention.ts)
 * — the hint says so, or the numbers here look inconsistent with the KPIs
 * below, which do respect `?dias=`.
 */
const AttentionBand = ({ tiles }: AttentionBandProps) => (
  <section aria-labelledby="banda-atencion" className={cn(NB_SURFACE, "shadow-nb-lg")}>
    <header className="flex flex-wrap items-center gap-2 rounded-t-nb border-b-2 border-ink bg-ink px-6 py-4 text-text-inverse">
      <h2 id="banda-atencion" className={T_PANEL_TITLE}>
        Requiere atención
      </h2>
      <span className="text-xs text-text-inverse-secondary">Ahora mismo, sin importar el rango.</span>
    </header>
    <div className="grid grid-cols-2 gap-3 p-6 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => (
        <MetricTile key={tile.key} level={tile.level} count={tile.count} label={tile.label} />
      ))}
    </div>
  </section>
);

export { AttentionBand };
export type { AttentionBandProps };
