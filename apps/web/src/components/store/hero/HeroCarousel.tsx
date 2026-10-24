"use client";

import type { PublicStorefrontHero } from "@gira/shared";
import { useRef } from "react";
import { HeroButton } from "./HeroButton";
import { HeroCards } from "./HeroCards";
import { HeroPhotos } from "./HeroPhotos";
import { HeroTitles } from "./HeroTitles";
import { useHeroCarousel } from "./useHeroCarousel";
import { useHeroControls } from "./useHeroControls";

interface HeroCarouselProps {
  hero: PublicStorefrontHero;
  /** What to show when the team left the headline empty. */
  fallbackHeadline: string;
}

/**
 * The hero is the photo: full-bleed behind the transparent navbar, handing over
 * to the next one on its own (it drifts in from the right). Each photo has its
 * own title, cards and button colour; they change with it. By hand: arrow
 * keys on a computer, a horizontal swipe on a phone.
 */
const HeroCarousel = ({ hero, fallbackHeadline }: HeroCarouselProps) => {
  const { active, previous, next, goPrevious, focusProps } = useHeroCarousel(hero.slides.length);
  const sectionRef = useRef<HTMLElement>(null);
  const swipeProps = useHeroControls(sectionRef, { next, previous: goPrevious });
  const slide = hero.slides[active]!;

  return (
    <section
      ref={sectionRef}
      aria-label="Portada"
      aria-roledescription="carrusel"
      className="store-hero relative -mt-[calc(var(--store-nav-height)+var(--store-marquee-block))] h-dvh min-h-[34rem] touch-pan-y overflow-hidden"
      {...focusProps}
      {...swipeProps}
    >
      <HeroPhotos slides={hero.slides} active={active} previous={previous} />
      <HeroCards slides={hero.slides} active={active} />
      <div className="relative mx-auto flex h-full max-w-[90rem] flex-col justify-end gap-8 px-4 pb-10 md:px-8 md:pb-14">
        <HeroTitles slides={hero.slides} active={active} fallbackHeadline={fallbackHeadline} />
        <HeroButton product={slide.product} color={slide.buttonColor} />
      </div>
    </section>
  );
};

export type { HeroCarouselProps };
export { HeroCarousel };
