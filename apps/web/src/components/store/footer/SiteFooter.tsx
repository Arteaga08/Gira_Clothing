import { getCategories } from "@/lib/api/storefront";
import { buildFooterColumns } from "@/lib/store/footerLinks";
import { activeSocialNetworks } from "@/lib/store/socialLinks";
import { SiteFooterView } from "./SiteFooterView";

/**
 * Footer of every store page (M13 section 9). The «Tienda» column reads the
 * real categories; an unreachable API leaves it with the fixed links only.
 */
const SiteFooter = async () => {
  const categories = await getCategories();
  return (
    <SiteFooterView
      columns={buildFooterColumns(categories)}
      networks={activeSocialNetworks()}
      year={new Date().getFullYear()}
    />
  );
};

export { SiteFooter };
