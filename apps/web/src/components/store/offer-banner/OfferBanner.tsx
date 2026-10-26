import { getOfferBanner } from "@/lib/api/storefront";
import { OfferBannerView } from "./OfferBannerView";

/**
 * Offer banner of the home (M13 section 7), below «Novedades». Edited in
 * «Contenido de home». Hidden, or the API unreachable, no section.
 */
const OfferBanner = async () => {
  const banner = await getOfferBanner();
  if (!banner) return null;
  return <OfferBannerView banner={banner} />;
};

export { OfferBanner };
