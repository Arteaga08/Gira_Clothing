"use client";

import type { PublicStorefrontHero } from "@gira/shared";
import { HeroButton } from "./HeroButton";
import { HeroCards } from "./HeroCards";
import { HeroTitle } from "./HeroTitle";
import { HeroTrack } from "./HeroTrack";
import { useHeroCarousel } from "./useHeroCarousel";

interface HeroCarouselProps {
  hero: PublicStorefrontHero;
  /** What to show when the team left the headline empty. */
  fallbackHeadline: string;
}

/**
 * The hero is the photo: full-bleed behind the transparent navbar, rising to
 * the next one on its own. The title and the one button sit at the bottom
 * left; cards float on the right. Colours and cards belong to the visible
 * photo, so they change with it.
 */
const HeroCarousel = ({ hero, fallbackHeadline }: HeroCarouselProps) => {
  const { pos, active, animate, focusProps } = useHeroCarousel(hero.slides.length);
  const slide = hero.slides[active]!;

  return (
    <section
      aria-label="Portada"
      className="relative -mt-[var(--store-nav-height)] h-[calc(100dvh-var(--store-marquee-height))] min-h-[34rem] overflow-hidden"
      {...focusProps}
    >
      <div className="absolute inset-0">
        <HeroTrack slides={hero.slides} pos={pos} animate={animate} />
      </div>
      <HeroCards cards={slide.cards} cycleKey={pos} />
      <div className="relative mx-auto flex h-full max-w-[90rem] flex-col justify-end gap-8 px-4 pb-10 md:px-8 md:pb-14">
        <HeroTitle headline={hero.headline.trim() || fallbackHeadline} color={slide.titleColor} />
        <HeroButton product={slide.product} color={slide.buttonColor} />
      </div>
    </section>
  );
};

export type { HeroCarouselProps };
export { HeroCarousel };
