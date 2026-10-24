import { getBestSellers } from "@/lib/api/storefront";
import { loadSession } from "@/lib/api/session";
import { BestSellersTrack } from "./BestSellersTrack";

/**
 * «Más vendidos» of the home (M13 section 3): the products the team flagged in
 * the catalog CRUD, newest first. No flagged products, no section.
 */
const BestSellers = async () => {
  const [products, session] = await Promise.all([getBestSellers(), loadSession()]);
  if (products.length === 0) return null;
  return <BestSellersTrack products={products} authenticated={session.kind === "authenticated"} />;
};

export { BestSellers };
