import { HeroButton } from "./HeroButton";
import { HeroTitle } from "./HeroTitle";

interface HeroFallbackProps {
  headline: string;
}

/** No photos yet (or the API is unreachable): the brand name on the forest ground, and the way to the shop. */
const HeroFallback = ({ headline }: HeroFallbackProps) => (
  <section
    aria-label="Portada"
    className="relative -mt-[var(--store-nav-height)] h-[calc(100dvh-var(--store-marquee-height))] min-h-[34rem] overflow-hidden"
  >
    <div className="relative mx-auto flex h-full max-w-[90rem] flex-col justify-end gap-8 px-4 pb-10 md:px-8 md:pb-14">
      <HeroTitle headline={headline} color="bone" />
      <HeroButton product={null} color="yellow" />
    </div>
  </section>
);

export type { HeroFallbackProps };
export { HeroFallback };
