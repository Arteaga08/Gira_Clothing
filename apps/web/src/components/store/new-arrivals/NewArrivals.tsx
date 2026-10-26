import { getNewArrivals } from "@/lib/api/storefront";
import { loadSession } from "@/lib/api/session";
import { NewArrivalsBento } from "./NewArrivalsBento";

/**
 * «Novedades» of the home (M13 section 6): the products the team flagged in
 * the catalog CRUD, newest first, at most five. No flagged products, no section.
 */
const NewArrivals = async () => {
  const [products, session] = await Promise.all([getNewArrivals(), loadSession()]);
  if (products.length === 0) return null;
  return <NewArrivalsBento products={products} authenticated={session.kind === "authenticated"} />;
};

export { NewArrivals };
