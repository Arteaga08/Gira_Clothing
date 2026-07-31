import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  ClipboardTextIcon,
  FoldersIcon,
  PackageIcon,
  PaintBrushIcon,
  ShoppingBagOpenIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  TagIcon,
  TruckIcon,
  TShirtIcon,
  UsersIcon,
} from "@phosphor-icons/react/dist/ssr";

interface NavItemConfig {
  /** Stable id — English, never shown to the user. */
  key: string;
  /** User-facing, Spanish. */
  label: string;
  href: string;
  icon: PhosphorIcon;
  /** CommandPalette search terms, Spanish. */
  keywords: readonly string[];
  /** False until the screen behind this route lands (M8-M12). */
  available: boolean;
}

interface NavGroupConfig {
  key: string;
  label: string;
  items: readonly NavItemConfig[];
}

/**
 * The single registry Sidebar, Breadcrumbs, and the CommandPalette all read
 * from. Landing a screen in M8-M12 is flipping one `available` flag here,
 * not editing three components. URL segments are Spanish (the user reads
 * them in the address bar); everything else here is English.
 */
const NAV_GROUPS: readonly NavGroupConfig[] = [
  {
    key: "operation",
    label: "Operación",
    items: [
      {
        key: "summary",
        label: "Resumen",
        href: "/resumen",
        icon: SquaresFourIcon,
        keywords: ["resumen", "inicio", "dashboard"],
        available: true,
      },
      {
        key: "orders",
        label: "Pedidos",
        href: "/pedidos",
        icon: ShoppingBagOpenIcon,
        keywords: ["pedidos", "ordenes", "ventas"],
        available: false,
      },
      {
        key: "shipments",
        label: "Envíos",
        href: "/envios",
        icon: TruckIcon,
        keywords: ["envios", "guias", "paqueteria"],
        available: false,
      },
    ],
  },
  {
    key: "catalog",
    label: "Catálogo",
    items: [
      {
        key: "products",
        label: "Productos",
        href: "/productos",
        icon: TShirtIcon,
        keywords: ["productos", "catalogo"],
        available: false,
      },
      {
        key: "prints",
        label: "Estampas",
        href: "/estampas",
        icon: PaintBrushIcon,
        keywords: ["estampas", "disenos"],
        available: false,
      },
      {
        key: "printFamilies",
        label: "Familias",
        href: "/familias",
        icon: FoldersIcon,
        keywords: ["familias", "colecciones"],
        available: false,
      },
      {
        key: "categories",
        label: "Categorías",
        href: "/categorias",
        icon: TagIcon,
        keywords: ["categorias"],
        available: false,
      },
    ],
  },
  {
    key: "inventory",
    label: "Inventario",
    items: [
      {
        key: "variants",
        label: "Variantes",
        href: "/inventario",
        icon: PackageIcon,
        keywords: ["inventario", "stock", "variantes"],
        available: false,
      },
    ],
  },
  {
    key: "system",
    label: "Sistema",
    items: [
      {
        key: "customers",
        label: "Clientes",
        href: "/clientes",
        icon: UsersIcon,
        keywords: ["clientes", "usuarios"],
        available: false,
      },
      {
        key: "settings",
        label: "Ajustes",
        href: "/ajustes",
        icon: SlidersHorizontalIcon,
        keywords: ["ajustes", "configuracion"],
        available: false,
      },
      {
        key: "auditLog",
        label: "Auditoría",
        href: "/auditoria",
        icon: ClipboardTextIcon,
        keywords: ["auditoria", "bitacora", "logs"],
        available: false,
      },
    ],
  },
];

/** Flattened view of `NAV_GROUPS`, for Breadcrumbs and the CommandPalette. */
const NAV_ITEMS: readonly NavItemConfig[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * Prefix match with a slash boundary, so `/pedidosArchivados` doesn't
 * falsely activate the "Pedidos" entry (`/pedidos`).
 */
const isNavItemActive = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

export { NAV_GROUPS, NAV_ITEMS, isNavItemActive };
export type { NavGroupConfig, NavItemConfig };
