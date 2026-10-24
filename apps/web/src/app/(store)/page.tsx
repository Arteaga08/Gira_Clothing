import { BestSellers } from "@/components/store/best-sellers/BestSellers";
import { Hero } from "@/components/store/hero/Hero";

/**
 * Home of the storefront, built section by section (spec §4). Section 2: hero.
 * Section 3: best sellers. The rest of the page follows with its own sections.
 */
const HomePage = () => (
  <>
    <Hero />
    <BestSellers />
  </>
);

export default HomePage;
