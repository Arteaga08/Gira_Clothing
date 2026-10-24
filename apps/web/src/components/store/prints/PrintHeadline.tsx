import type { PublicPrintSummary } from "@/lib/api/storefront";

interface PrintHeadlineProps {
  prints: PublicPrintSummary[];
  activeIndex: number;
}

/**
 * The selected print's name in a big label. All names sit stacked in one grid
 * cell, so the label keeps its place while the old name leaves fast and the
 * new one comes in a beat later. Only the selected one is exposed.
 */
const PrintHeadline = ({ prints, activeIndex }: PrintHeadlineProps) => (
  <div style={{ ["--i" as string]: 0 }} className="reveal-item grid place-items-center">
    {prints.map((print, position) => {
      const active = position === activeIndex;
      return (
        <h3
          key={print.id}
          aria-hidden={!active}
          data-active={active}
          className="prints-headline col-start-1 row-start-1 rounded-nb border-2 border-ink bg-surface px-5 py-1 text-center font-display text-[clamp(3.25rem,12vw,10rem)] uppercase leading-[0.95] text-ink shadow-nb-lg md:px-8 md:py-2"
        >
          {print.name}
        </h3>
      );
    })}
  </div>
);

export { PrintHeadline };
