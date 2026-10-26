import type { PublicOfferBanner } from "@gira/shared";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { buttonClassName } from "@/components/ui/Button";
import { STORE_ROUTES, productRoute } from "@/lib/store/routes";
import { bannerImageUrl } from "./bannerImage";
import { OfferMarquee } from "./OfferMarquee";

const TITLE_ID = "offer-banner-title";

interface OfferBannerViewProps {
  banner: PublicOfferBanner;
}

/**
 * The photo edge to edge under an ink veil, the phrase looping across it and
 * one button to the chosen model's page, or the shop without one (a model
 * retired since leaves no dead link). Base and olita cut in ink (a photo
 * cannot fill a cut). Lila button («edit»: navigate): the one yellow button
 * of the page is the hero's.
 */
const OfferBannerView = ({ banner }: OfferBannerViewProps) => {
  const href = banner.product ? productRoute(banner.product.slug) : STORE_ROUTES.shop;
  return (
    <section aria-labelledby={TITLE_ID} className="offer-banner store-cut store-cut-olita">
      <h2 id={TITLE_ID} className="sr-only">
        Ofertas
      </h2>
      {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured */}
      <img
        src={bannerImageUrl(banner.image.url)}
        alt={banner.alt}
        width={banner.image.width}
        height={banner.image.height}
        loading="lazy"
        decoding="async"
        className="offer-banner__photo"
      />
      <div aria-hidden="true" className="offer-banner__veil" />
      <div className="relative z-10 flex min-h-[26rem] flex-col justify-center gap-8 py-14 md:aspect-[16/6] md:min-h-[30rem] md:gap-10">
        <OfferMarquee message={banner.message} />
        <div className="px-4 md:px-12">
          <a href={href} className={buttonClassName("edit", "md", "text-base")}>
            {banner.buttonLabel}
            <ArrowUpRight aria-hidden="true" weight="bold" className="size-5" />
          </a>
        </div>
      </div>
    </section>
  );
};

export type { OfferBannerViewProps };
export { OfferBannerView };
