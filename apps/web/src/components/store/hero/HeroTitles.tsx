import type { PublicHeroSlide } from "@gira/shared";
import { cn } from "@/lib/cn";
import { HeroTitleWords } from "./HeroTitleWords";

interface HeroTitlesProps {
  slides: PublicHeroSlide[];
  active: number;
  /** Used by any photo whose title was left empty. */
  fallbackHeadline: string;
}

/**
 * Every photo has its own title. They share one cell of a grid, so the block
 * never jumps in size; the words of the visible one fade in over the ones that
 * left. The hidden titles are out of the accessibility tree: the page has one
 * heading.
 */
const HeroTitles = ({ slides, active, fallbackHeadline }: HeroTitlesProps) => (
  <h1 className="grid">
    {slides.map((slide, i) => (
      <span
        key={`${slide.image.url}-${i}`}
        aria-hidden={i === active ? undefined : true}
        className={cn("col-start-1 row-start-1 self-end", i !== active && "pointer-events-none")}
      >
        <HeroTitleWords
          headline={slide.headline.trim() || fallbackHeadline}
          color={slide.titleColor}
          shown={i === active}
        />
      </span>
    ))}
  </h1>
);

export type { HeroTitlesProps };
export { HeroTitles };
