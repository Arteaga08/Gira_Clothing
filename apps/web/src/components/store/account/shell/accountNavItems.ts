import { STORE_ROUTES } from "@/lib/store/routes";

interface AccountNavItem {
  id: "summary" | "orders" | "profile" | "addresses" | "billing" | "saved";
  label: string;
  /** `null` until the section exists (M15c): it shows as «Próximamente», not as a dead link. */
  href: string | null;
  /** The sidebar marks it active on this exact path only (the summary), not on its sub-paths. */
  exact?: boolean;
}

/** The single list behind both the desktop sidebar and the mobile tile grid. */
const ACCOUNT_NAV_ITEMS: readonly AccountNavItem[] = [
  { id: "summary", label: "Resumen", href: STORE_ROUTES.account, exact: true },
  { id: "orders", label: "Mis pedidos", href: STORE_ROUTES.orders },
  { id: "profile", label: "Perfil", href: STORE_ROUTES.profile },
  { id: "addresses", label: "Direcciones", href: null },
  { id: "billing", label: "Facturación", href: null },
  { id: "saved", label: "Guardados", href: STORE_ROUTES.saved },
];

const isNavItemActive = (item: AccountNavItem, pathname: string): boolean => {
  if (item.href === null) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
};

export type { AccountNavItem };
export { ACCOUNT_NAV_ITEMS, isNavItemActive };
