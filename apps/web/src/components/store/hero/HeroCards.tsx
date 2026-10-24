import { HERO_MAX_CARDS, type PublicHeroSlide } from "@gira/shared";
import { cn } from "@/lib/cn";
import { SURFACE_FILL } from "@/lib/store/heroColors";

interface HeroCardsProps {
  slides: PublicHeroSlide[];
  active: number;
}

/** Two fixed places on the right; the farther one rises more while the hero scrolls away. */
const SLOTS = [
  { position: "right-[7%] top-[34%]", tilt: "-8deg", rise: "-9rem" },
  { position: "right-[17%] bottom-[14%]", tilt: "6deg", rise: "-17rem" },
].slice(0, HERO_MAX_CARDS);

/**
 * Floating tags beside the photo. Like the title they look like buttons but
 * are only text. The cards of every photo stay mounted in the same two places
 * (a remount blinks) and only mark `shown` / `hidden`; the motion style is CSS.
 * Hidden on phones, where there is no room beside the title.
 */
const HeroCards = ({ slides, active }: HeroCardsProps) => (
  <div className="pointer-events-none absolute inset-0 hidden md:block">
    {SLOTS.map((slot, slotIndex) => (
      <div
        key={slot.position}
        className={cn("store-scroll-rise absolute grid", slot.position)}
        style={{ ["--rise-distance" as string]: slot.rise }}
      >
        {slides.map((slide, i) => {
          const card = slide.cards[slotIndex];
          if (!card) return null;
          return (
            <p
              key={`${slide.image.url}-${i}`}
              aria-hidden={i === active ? undefined : true}
              data-state={i === active ? "shown" : "hidden"}
              className={cn(
                "hero-card col-start-1 row-start-1 max-w-[16rem] justify-self-start rounded-nb-sm border-2 border-ink px-6 pb-2 pt-3 font-display text-[clamp(1.75rem,3.2vw,3rem)] font-normal uppercase leading-[1.05] text-text-primary shadow-nb",
                SURFACE_FILL[card.color],
              )}
              style={{ rotate: slot.tilt, ["--i" as string]: slotIndex }}
            >
              {card.text}
            </p>
          );
        })}
      </div>
    ))}
  </div>
);

export type { HeroCardsProps };
export { HeroCards };
