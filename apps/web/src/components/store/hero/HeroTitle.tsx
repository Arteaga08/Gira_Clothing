import type { HeroSurfaceColor } from "@gira/shared";
import { cn } from "@/lib/cn";
import { SURFACE_FILL } from "@/lib/store/heroColors";

interface HeroTitleProps {
  headline: string;
  color: HeroSurfaceColor;
}

/** One tilt per word, so the stack reads as stickers slapped on the photo. */
const TILTS = ["-rotate-2", "rotate-1", "-rotate-1"] as const;

/**
 * The title as floating stickers: they look like buttons (solid block, ink
 * border, hard shadow) but are plain text. The solid fill keeps the words
 * readable over any photo, and it eases to the colour of the visible photo.
 */
const HeroTitle = ({ headline, color }: HeroTitleProps) => (
  <h1 className="flex flex-col items-start gap-2 md:gap-3">
    {headline
      .split(/\s+/)
      .filter(Boolean)
      .map((word, i) => (
        <span
          key={`${word}-${i}`}
          className={cn(
            "store-rise block rounded-nb-sm border-2 border-ink px-4 pb-1 pt-2 font-display text-[clamp(2.75rem,min(8vw,13dvh),7rem)] font-normal uppercase leading-none text-text-primary shadow-nb transition-[background-color] duration-500 md:px-6",
            SURFACE_FILL[color],
            TILTS[i % TILTS.length],
          )}
          style={{ ["--rise-delay" as string]: `${i * 90}ms` }}
        >
          {word}
        </span>
      ))}
  </h1>
);

export type { HeroTitleProps };
export { HeroTitle };
