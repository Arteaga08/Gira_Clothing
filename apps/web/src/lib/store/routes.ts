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

export { STORE_ROUTES };
