import type { PublicPrintSummary } from "@/lib/api/storefront";

interface PrintHeadlineProps {
  prints: PublicPrintSummary[];
  activeIndex: number;
}

/**
 * The selected print's name, huge, straight on the photo (hueso with an ink
 * outline and a hard ink shadow, like the reference's big word), and its line
 * in a solid label underneath. All prints sit stacked in one grid cell, so the
 * block keeps its place while the old one leaves fast and the new one comes in
 * a beat later. Only the selected one is exposed.
 */
const PrintHeadline = ({ prints, activeIndex }: PrintHeadlineProps) => (
  <div style={{ ["--i" as string]: 0 }} className="reveal-item grid place-items-center">
    {prints.map((print, position) => {
      const active = position === activeIndex;
      return (
        <div
          key={print.id}
          aria-hidden={!active}
          data-active={active}
          className="prints-headline col-start-1 row-start-1 flex max-w-full flex-col items-center gap-5 md:gap-6"
        >
          <h3 className="prints-headline-name max-w-full text-center font-display text-[clamp(4rem,15vw,13rem)] uppercase leading-[0.9]">
            {print.name}
          </h3>
          {print.blurb ? (
            <p className="max-w-xl rounded-nb border-2 border-ink bg-surface px-4 py-2 text-center text-base font-bold leading-snug text-ink shadow-nb md:text-lg">
              {print.blurb}
            </p>
          ) : null}
        </div>
      );
    })}
  </div>
);

export { PrintHeadline };
