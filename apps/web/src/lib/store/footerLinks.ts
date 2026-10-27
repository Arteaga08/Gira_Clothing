import { STORE_ROUTES, categoryRoute } from "./routes";

/**
 * Link columns of the store footer. Most destinations do not exist yet (the
 * catalog arrives with M14, account with M15, help and legal pages with M17):
 * they are drawn now so the footer is complete when the pages land, the same
 * rule the navbar follows.
 */

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumnData {
  title: string;
  links: FooterLink[];
}

const SHOP_CATEGORY_LIMIT = 4;

const STATIC_COLUMNS: FooterColumnData[] = [
  {
    title: "Ayuda",
    links: [
      { label: "Envíos y entregas", href: "/envios" },
      { label: "Cambios y devoluciones", href: "/devoluciones" },
      { label: "Contacto", href: "/contacto" },
    ],
  },
  {
    title: "Cuenta",
    links: [
      { label: "Mi cuenta", href: STORE_ROUTES.account },
      { label: "Mis pedidos", href: `${STORE_ROUTES.account}/pedidos` },
      { label: "Carrito", href: STORE_ROUTES.cart },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Términos y condiciones", href: "/terminos" },
      { label: "Aviso de privacidad", href: "/privacidad" },
    ],
  },
];

/** «Tienda»: the real categories (at most 4), then «Novedades» and the whole shop. */
const buildShopColumn = (categories: { name: string; slug: string }[]): FooterColumnData => ({
  title: "Tienda",
  links: [
    ...categories.slice(0, SHOP_CATEGORY_LIMIT).map((category) => ({
      label: category.name,
      href: categoryRoute(category.slug),
    })),
    { label: "Novedades", href: STORE_ROUTES.newArrivals },
    { label: "Toda la tienda", href: STORE_ROUTES.shop },
  ],
});

/** The four columns, in the order they show. */
const buildFooterColumns = (categories: { name: string; slug: string }[]): FooterColumnData[] => [
  buildShopColumn(categories),
  ...STATIC_COLUMNS,
];

export type { FooterLink, FooterColumnData };
export { buildFooterColumns };
