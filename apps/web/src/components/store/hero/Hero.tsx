import { getHero } from "@/lib/api/storefront";
import { HeroCarousel } from "./HeroCarousel";
import { HeroFallback } from "./HeroFallback";

const BRAND_HEADLINE = "Gira Clothing";

/** Hero of the home (M13 section 2): reads what the team set in «Contenido de home». */
const Hero = async () => {
  const hero = await getHero();
  return hero.slides.length > 0 ? (
    <HeroCarousel hero={hero} fallbackHeadline={BRAND_HEADLINE} />
  ) : (
    <HeroFallback headline={BRAND_HEADLINE} />
  );
};

export { Hero };
