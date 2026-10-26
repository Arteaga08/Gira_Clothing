/**
 * Public storefront URLs. Navbar links point here; each destination page
 * arrives with its own milestone (catalog M14, account M15, cart M16).
 */
const STORE_ROUTES = {
  home: "/",
  shop: "/tienda",
  cart: "/carrito",
  login: "/ingresar",
  account: "/cuenta",
  /** Catalog showing only the products flagged «Novedad» (the `novedad` filter maps to the API's `newArrival`). */
  newArrivals: "/tienda?novedad=si",
} as const;

/** Product page; it arrives with the catalog milestone (M14). */
const productRoute = (slug: string): string => `/tienda/${slug}`;

/** Catalog filtered by category; the catalog arrives with M14 (the `category` filter matches the API's). */
const categoryRoute = (slug: string): string => `/tienda?categoria=${encodeURIComponent(slug)}`;

/** Catalog filtered by print; the catalog arrives with M14 (the `estampa` filter maps to the API's `print`). */
const printRoute = (slug: string): string => `/tienda?estampa=${encodeURIComponent(slug)}`;

export { STORE_ROUTES, productRoute, categoryRoute, printRoute };
