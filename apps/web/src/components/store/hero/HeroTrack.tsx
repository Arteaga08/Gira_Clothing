import type { PublicHeroSlide } from "@gira/shared";
import { TRANSITION_MS } from "./useHeroCarousel";

interface HeroTrackProps {
  slides: PublicHeroSlide[];
  pos: number;
  animate: boolean;
}

/**
 * Vertical strip of photos (plus a clone of the first, so the loop never
 * travels back down) inside a size container: `cqh` makes one step exactly one
 * frame tall. Only the first photo is eager; the rest are far down the strip.
 */
const HeroTrack = ({ slides, pos, animate }: HeroTrackProps) => {
  const strip = [...slides, slides[0]!];
  return (
    <div className="h-full overflow-hidden [container-type:size]">
      <div
        className="flex flex-col transition-transform ease-[var(--store-nav-ease)] motion-reduce:transition-none"
        style={{
          transform: `translateY(calc(${pos} * -100cqh))`,
          transitionDuration: animate ? `${TRANSITION_MS}ms` : "0ms",
        }}
      >
        {strip.map((slide, i) => (
          <div key={`${slide.image.url}-${i}`} className="h-[100cqh] shrink-0 overflow-hidden bg-surface-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured */}
            <img
              src={slide.image.url}
              alt={i === slides.length ? "" : (slide.product?.name ?? "")}
              aria-hidden={i === slides.length ? true : undefined}
              width={slide.image.width}
              height={slide.image.height}
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : "auto"}
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export type { HeroTrackProps };
export { HeroTrack };
