import { NAV_ITEMS } from "./navigation";

interface Breadcrumb {
  label: string;
  /** Absent on the current page: the last crumb is not a link. */
  href?: string;
}

const HOME_CRUMB: Breadcrumb = { label: "Panel", href: "/resumen" };

/** Shown for a dynamic segment (an order id) until the page registers its own label. */
const DETAIL_FALLBACK_LABEL = "Detalle";

/**
 * Crumbs from the pathname alone, using the nav registry for labels. A dynamic
 * segment under a registered section never shows its raw value: an order's id
 * must not appear in the UI, so it reads "Detalle" unless the page passes a
 * `lastLabel` (the order number, via BreadcrumbLabel).
 */
const breadcrumbsFor = (pathname: string, lastLabel?: string): Breadcrumb[] => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: HOME_CRUMB.label }];

  const crumbs: Breadcrumb[] = [HOME_CRUMB];
  let href = "";
  let parentIsRegistered = false;

  segments.forEach((segment, index) => {
    const parentHref = href;
    href += `/${segment}`;
    const isLast = index === segments.length - 1;
    const navItem = NAV_ITEMS.find((item) => item.href === href);
    parentIsRegistered = NAV_ITEMS.some((item) => item.href === parentHref);

    let label = navItem?.label ?? (parentIsRegistered ? DETAIL_FALLBACK_LABEL : segment);
    if (isLast && lastLabel && !navItem) label = lastLabel;
    crumbs.push(isLast ? { label } : { label, href });
  });

  return crumbs;
};

export { breadcrumbsFor };
export type { Breadcrumb };
