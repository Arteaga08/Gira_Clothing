import type { HeroSurfaceColor } from "@gira/shared";
import { cn } from "@/lib/cn";
import { SURFACE_FILL } from "@/lib/store/heroColors";

interface HeroTitleWordsProps {
  headline: string;
  color: HeroSurfaceColor;
  /** Whether this title is the one on screen. Words leave fast and enter one after another. */
  shown?: boolean;
}

/** One tilt per word, so the stack reads as stickers slapped on the photo. */
const TILTS = ["-rotate-2", "rotate-1", "-rotate-1"] as const;

/**
 * The words of a title as floating stickers: they look like buttons (solid
 * block, ink border, hard shadow) but are plain text. The solid fill keeps the
 * words readable over any photo. They only mark `shown` / `hidden` (and their
 * place in the stack, for the stagger); the motion style is CSS.
 */
const HeroTitleWords = ({ headline, color, shown = true }: HeroTitleWordsProps) => (
  <span className="flex flex-col items-start gap-2 md:gap-3">
    {headline
      .split(/\s+/)
      .filter(Boolean)
      .map((word, i) => (
        <span
          key={`${word}-${i}`}
          data-state={shown ? "shown" : "hidden"}
          className={cn(
            "hero-word block rounded-nb-sm border-2 border-ink px-4 pb-1 pt-2 font-display text-[clamp(2.75rem,min(8vw,13dvh),7rem)] font-normal uppercase leading-none text-text-primary shadow-nb md:px-6",
            SURFACE_FILL[color],
            TILTS[i % TILTS.length],
          )}
          style={{ ["--i" as string]: i }}
        >
          {word}
        </span>
      ))}
  </span>
);

export type { HeroTitleWordsProps };
export { HeroTitleWords };
