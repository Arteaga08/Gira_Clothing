import { HeroButton } from "./HeroButton";
import { HeroTitleWords } from "./HeroTitleWords";

interface HeroFallbackProps {
  headline: string;
}

/** No photos yet (or the API is unreachable): the brand name on the forest ground, and the way to the shop. */
const HeroFallback = ({ headline }: HeroFallbackProps) => (
  <section
    aria-label="Portada"
    className="store-hero relative -mt-[calc(var(--store-nav-height)+var(--store-marquee-block))] h-dvh min-h-[34rem] overflow-hidden"
  >
    <div className="relative mx-auto flex h-full max-w-[90rem] flex-col justify-end gap-8 px-4 pb-10 md:px-8 md:pb-14">
      <h1>
        <HeroTitleWords headline={headline} color="bone" />
      </h1>
      <HeroButton product={null} color="yellow" />
    </div>
  </section>
);

export type { HeroFallbackProps };
export { HeroFallback };
