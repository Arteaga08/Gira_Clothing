import type { PublicProductSummary } from "@gira/shared";
import { BestSellerCard } from "@/components/store/best-sellers/BestSellerCard";

interface CatalogGridProps {
  products: PublicProductSummary[];
  authenticated: boolean;
}

/**
 * The page's products, four to a row on a wide screen, in the same card as
 * «Más vendidos». `store-reveal` only brings the card's hover lift; the grid is
 * never held back waiting for a scroll.
 */
const CatalogGrid = ({ products, authenticated }: CatalogGridProps) => (
  <ul data-reveal="shown" className="store-reveal grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
    {products.map((product, index) => (
      <li key={product.id} className="grid">
        <BestSellerCard product={product} authenticated={authenticated} index={index} />
      </li>
    ))}
  </ul>
);

export type { CatalogGridProps };
export { CatalogGrid };
