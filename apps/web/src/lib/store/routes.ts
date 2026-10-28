/**
 * Public storefront URLs. Navbar links point here; each destination page
 * arrives with its own milestone (catalog M14, access pages M15a, account M15b/c, cart M16).
 */
const STORE_ROUTES = {
  home: "/",
  shop: "/tienda",
  cart: "/carrito",
  login: "/ingresar",
  register: "/crear-cuenta",
  forgotPassword: "/recuperar-contrasena",
  resetPassword: "/restablecer-contrasena",
  verifyEmail: "/verificar-correo",
  account: "/cuenta",
  orders: "/cuenta/pedidos",
  profile: "/cuenta/perfil",
  saved: "/cuenta/guardados",
  /** Catalog showing only the products flagged «Novedad» (the `novedad` filter maps to the API's `newArrival`). */
  newArrivals: "/tienda?novedad=si",
} as const;

/** One of the signed-in customer's orders, by its internal id (not the public id). */
const orderRoute = (id: string): string => `/cuenta/pedidos/${id}`;

/** Product page; it arrives with the catalog milestone (M14). */
const productRoute = (slug: string): string => `/tienda/${slug}`;

/** Catalog filtered by category; the catalog arrives with M14 (the `category` filter matches the API's). */
const categoryRoute = (slug: string): string => `/tienda?categoria=${encodeURIComponent(slug)}`;

/** Catalog filtered by print; the catalog arrives with M14 (the `estampa` filter maps to the API's `print`). */
const printRoute = (slug: string): string => `/tienda?estampa=${encodeURIComponent(slug)}`;

/**
 * Keeps `?redirect=` when a visitor hops between the access pages (login ↔ register), so a
 * purchase interrupted by the login still lands where it was. The default destination is
 * left out of the URL.
 */
const withRedirect = (path: string, redirect: string | undefined): string =>
  redirect === undefined || redirect === STORE_ROUTES.account ? path : `${path}?redirect=${encodeURIComponent(redirect)}`;

export { STORE_ROUTES, orderRoute, productRoute, categoryRoute, printRoute, withRedirect };
