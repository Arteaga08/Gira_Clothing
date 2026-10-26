import { BestSellers } from "@/components/store/best-sellers/BestSellers";
import { Categories } from "@/components/store/categories/Categories";
import { Hero } from "@/components/store/hero/Hero";
import { NewArrivals } from "@/components/store/new-arrivals/NewArrivals";
import { OfferBanner } from "@/components/store/offer-banner/OfferBanner";
import { Prints } from "@/components/store/prints/Prints";

/**
 * Home of the storefront, built section by section (spec §4). Section 2: hero.
 * Section 3: best sellers. Section 4: categories. Section 5: prints. Section 6: new arrivals. Section 7: offer banner. The rest of the page follows with its own sections.
 */
const HomePage = () => (
  <>
    <Hero />
    <BestSellers />
    <Categories />
    <Prints />
    <NewArrivals />
    <OfferBanner />
  </>
);

export default HomePage;
