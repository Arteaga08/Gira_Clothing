"use client";

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import type { PublicProductSummary } from "@gira/shared";
import { IconButton } from "@/components/ui/IconButton";
import { BestSellerCard } from "./BestSellerCard";
import { useRevealOnScroll } from "./useRevealOnScroll";
import { useTrackScroll } from "./useTrackScroll";

interface BestSellersTrackProps {
  products: PublicProductSummary[];
  authenticated: boolean;
}

/**
 * Title and cards of the section, in a track that scrolls by swipe, wheel or
 * the side arrows. The arrows only show while the pointer is over the track
 * (or one has focus), and only on the side where there is more.
 */
const BestSellersTrack = ({ products, authenticated }: BestSellersTrackProps) => {
  const { ref, state } = useRevealOnScroll<HTMLElement>();
  const { track, canPrevious, canNext, onScroll, step } = useTrackScroll();

  return (
    <section
      ref={ref}
      data-reveal={state}
      aria-labelledby="best-sellers-title"
      aria-roledescription="carrusel"
      className="store-reveal best-section mx-auto w-full max-w-[96rem] py-14 md:py-24"
    >
      <h2
        id="best-sellers-title"
        style={{ ["--i" as string]: 0 }}
        className="reveal-item px-4 pb-8 font-display text-[clamp(2.5rem,7vw,5.5rem)] uppercase leading-[0.9] text-text-inverse md:px-8"
      >
        Más vendidos
      </h2>
      <div className="best-carousel relative">
        <div ref={track} onScroll={onScroll} className="best-track">
          {products.map((product, index) => (
            <BestSellerCard key={product.id} product={product} authenticated={authenticated} index={index} />
          ))}
        </div>
        <IconButton icon={ArrowLeft} label="Anteriores" variant="edit" data-available={canPrevious} onClick={() => step(-1)} className="best-arrow best-arrow-start" />
        <IconButton icon={ArrowRight} label="Siguientes" variant="edit" data-available={canNext} onClick={() => step(1)} className="best-arrow best-arrow-end" />
      </div>
    </section>
  );
};

export type { BestSellersTrackProps };
export { BestSellersTrack };
