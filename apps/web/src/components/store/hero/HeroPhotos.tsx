import type { PublicHeroSlide } from "@gira/shared";

interface HeroPhotosProps {
  slides: PublicHeroSlide[];
  active: number;
  previous: number | null;
}

/**
 * All photos are stacked and only mark their state (active, leaving, waiting);
 * how they change is the CSS of the chosen motion style. The pictures are drawn
 * 6% larger so a drift never shows an edge. Only the first is eager.
 */
const HeroPhotos = ({ slides, active, previous }: HeroPhotosProps) => (
  <div className="absolute inset-0 isolate overflow-hidden bg-surface-sunken">
    {slides.map((slide, i) => {
      const state = i === active ? "active" : i === previous ? "leaving" : "waiting";
      return (
        <div
          key={`${slide.image.url}-${i}`}
          aria-hidden={i === active ? undefined : true}
          data-state={state}
          className="hero-photo absolute inset-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured */}
          <img
            src={slide.image.url}
            alt={slide.product?.name ?? ""}
            width={slide.image.width}
            height={slide.image.height}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "auto"}
            decoding="async"
            className="h-full w-full scale-[1.06] object-cover"
          />
        </div>
      );
    })}
  </div>
);

export type { HeroPhotosProps };
export { HeroPhotos };
