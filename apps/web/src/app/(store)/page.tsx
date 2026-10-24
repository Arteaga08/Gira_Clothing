import { BestSellers } from "@/components/store/best-sellers/BestSellers";
import { Categories } from "@/components/store/categories/Categories";
import { Hero } from "@/components/store/hero/Hero";

/**
 * Home of the storefront, built section by section (spec §4). Section 2: hero.
 * Section 3: best sellers. Section 4: categories. The rest of the page follows with its own sections.
 */
const HomePage = () => (
  <>
    <Hero />
    <BestSellers />
    <Categories />
  </>
);

export default HomePage;
