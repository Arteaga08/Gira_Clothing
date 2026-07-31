import { NAV_ITEMS } from "./navigation";

interface Breadcrumb {
  label: string;
  href?: string;
}

const HOME_CRUMB: Breadcrumb = { label: "Panel", href: "/resumen" };

/**
 * Derived from the pathname against the navigation registry, not declared
 * per page: for the ~90% of screens where the label is exactly what the URL
 * already says, a prop or context threaded through every page would just
 * repeat the registry by hand. Unknown segments (ids, detail routes) fall
 * back to the raw segment; overriding the last crumb with a human label
 * (an order's folio instead of its Mongo id) is deferred to M9, the first
 * screen that actually has a detail route.
 */
const breadcrumbsFor = (pathname: string): Breadcrumb[] => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: HOME_CRUMB.label }];

  const crumbs: Breadcrumb[] = [HOME_CRUMB];
  let href = "";

  segments.forEach((segment, index) => {
    href += `/${segment}`;
    const isLast = index === segments.length - 1;
    const navItem = NAV_ITEMS.find((item) => item.href === href);
    const label = navItem?.label ?? segment;
    crumbs.push(isLast ? { label } : { label, href });
  });

  return crumbs;
};

export { breadcrumbsFor };
export type { Breadcrumb };
