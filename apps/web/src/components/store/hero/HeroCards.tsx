import { HERO_MAX_CARDS, type HeroCard } from "@gira/shared";
import { cn } from "@/lib/cn";
import { SURFACE_FILL } from "@/lib/store/heroColors";

interface HeroCardsProps {
  cards: HeroCard[];
  /** Changes with each photo so the cards of the new photo play their entrance again. */
  cycleKey: number;
}

/** Two fixed places on the right; the farther one rises more while the hero scrolls away. */
const SLOTS = [
  { position: "right-[7%] top-[34%]", tilt: "-8deg", rise: "-9rem" },
  { position: "right-[17%] bottom-[14%]", tilt: "6deg", rise: "-17rem" },
].slice(0, HERO_MAX_CARDS);

/**
 * Floating tags beside the photo. Like the title they look like buttons but are
 * only text. Each photo brings its own; hidden on phones, where there is no
 * room beside the title.
 */
const HeroCards = ({ cards, cycleKey }: HeroCardsProps) => (
  <div className="pointer-events-none absolute inset-0 hidden md:block">
    {SLOTS.map((slot, i) => {
      const card = cards[i];
      return (
        <div
          key={slot.position}
          className={cn("store-scroll-rise absolute", slot.position)}
          style={{ ["--rise-distance" as string]: slot.rise }}
        >
          {card ? (
            <p
              key={`${cycleKey}-${i}`}
              className={cn(
                "store-rise max-w-[16rem] rounded-nb-sm border-2 border-ink px-6 pb-2 pt-3 font-display text-[clamp(1.75rem,3.2vw,3rem)] font-normal uppercase leading-[1.05] text-text-primary shadow-nb",
                SURFACE_FILL[card.color],
              )}
              style={{ rotate: slot.tilt, ["--rise-delay" as string]: `${200 + i * 120}ms` }}
            >
              {card.text}
            </p>
          ) : null}
        </div>
      );
    })}
  </div>
);

export type { HeroCardsProps };
export { HeroCards };
