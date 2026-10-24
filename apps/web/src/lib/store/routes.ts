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
} as const;

/** Product page; it arrives with the catalog milestone (M14). */
const productRoute = (slug: string): string => `/tienda/${slug}`;

export { STORE_ROUTES, productRoute };
