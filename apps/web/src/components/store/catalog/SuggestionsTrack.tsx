"use client";

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import type { PublicProductSummary } from "@gira/shared";
import { BestSellerCard } from "@/components/store/best-sellers/BestSellerCard";
import { useRevealOnScroll } from "@/components/store/best-sellers/useRevealOnScroll";
import { useTrackScroll } from "@/components/store/best-sellers/useTrackScroll";
import { IconButton } from "@/components/ui/IconButton";

interface SuggestionsTrackProps {
  products: PublicProductSummary[];
  authenticated: boolean;
}

/**
 * «Te va a gustar»: a menta band (cut with clouds) under the listing, with the
 * same swipeable track and cards as «Más vendidos».
 */
const SuggestionsTrack = ({ products, authenticated }: SuggestionsTrackProps) => {
  const { ref, state } = useRevealOnScroll<HTMLElement>();
  const { track, canPrevious, canNext, onScroll, step } = useTrackScroll();

  return (
    <section
      ref={ref}
      data-reveal={state}
      aria-labelledby="catalog-suggestions-title"
      aria-roledescription="carrusel"
      className="store-reveal store-band-mint store-cut store-cut-nubes mt-14 md:mt-24"
    >
      <div className="mx-auto w-full max-w-[96rem] py-14 md:py-24">
        <h2
          id="catalog-suggestions-title"
          style={{ ["--i" as string]: 0 }}
          className="reveal-item px-4 font-display text-[clamp(2.5rem,7vw,5.5rem)] uppercase leading-[0.9] text-brand md:px-8"
        >
          Te va a gustar
        </h2>
        <p style={{ ["--i" as string]: 1 }} className="reveal-item px-4 pb-8 pt-3 text-lg md:px-8">
          Otras prendas que se llevan nuestros clientes.
        </p>
        <div className="best-carousel relative">
          <div ref={track} onScroll={onScroll} className="best-track">
            {products.map((product, index) => (
              <BestSellerCard key={product.id} product={product} authenticated={authenticated} index={index} />
            ))}
          </div>
          <IconButton icon={ArrowLeft} label="Anteriores" variant="edit" data-available={canPrevious} onClick={() => step(-1)} className="best-arrow best-arrow-start" />
          <IconButton icon={ArrowRight} label="Siguientes" variant="edit" data-available={canNext} onClick={() => step(1)} className="best-arrow best-arrow-end" />
        </div>
      </div>
    </section>
  );
};

export type { SuggestionsTrackProps };
export { SuggestionsTrack };
