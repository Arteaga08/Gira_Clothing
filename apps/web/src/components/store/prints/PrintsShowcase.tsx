"use client";

import type { PublicPrintSummary } from "@/lib/api/storefront";
import { useRevealOnScroll } from "@/components/store/best-sellers/useRevealOnScroll";
import { PrintBackdrop } from "./PrintBackdrop";
import { PrintCta } from "./PrintCta";
import { PrintHeadline } from "./PrintHeadline";
import { PrintTabs } from "./PrintTabs";
import { usePrintSelection } from "./usePrintSelection";

const PANEL_ID = "prints-panel";
const TITLE_ID = "prints-title";

interface PrintsShowcaseProps {
  prints: PublicPrintSummary[];
}

/**
 * The selected print's photo fills the whole section; over it, its name in a
 * big label, the row of names (as in the reference: the selected one is fully
 * lit) and the link to the catalog filtered by that print.
 */
const PrintsShowcase = ({ prints }: PrintsShowcaseProps) => {
  const { ref, state } = useRevealOnScroll<HTMLElement>();
  const { index, select, onKeyDown, register } = usePrintSelection(prints.length);
  const active = prints[index] ?? prints[0];
  if (!active) return null;

  return (
    <section
      ref={ref}
      data-reveal={state}
      aria-labelledby={TITLE_ID}
      className="store-reveal prints-section store-cut store-cut-cupon"
    >
      <h2 id={TITLE_ID} className="sr-only">
        Prints
      </h2>
      <PrintBackdrop prints={prints} activeIndex={index} />
      <div className="relative flex min-h-[38rem] flex-col items-center justify-center gap-10 px-4 py-16 md:min-h-[min(92svh,54rem)] md:gap-14 md:py-24">
        <div id={PANEL_ID} role="tabpanel" aria-labelledby={`print-tab-${active.slug}`} className="flex flex-col items-center gap-8">
          <PrintHeadline prints={prints} activeIndex={index} />
        </div>
        <PrintTabs
          prints={prints}
          activeIndex={index}
          panelId={PANEL_ID}
          onSelect={select}
          onKeyDown={onKeyDown}
          register={register}
        />
        <div style={{ ["--i" as string]: 2 }} className="reveal-item">
          <PrintCta slug={active.slug} name={active.name} />
        </div>
      </div>
    </section>
  );
};

export { PrintsShowcase };
