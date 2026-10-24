import type { CategoryColor, PublicProductSummary, PublicStorefrontHero, StorefrontAnnouncement } from "@gira/shared";
import { request, expectData } from "./request";
import { CATALOG_CATEGORIES_PATH, CATALOG_PRODUCTS_PATH, STOREFRONT_ANNOUNCEMENT_PATH, STOREFRONT_HERO_PATH } from "./paths";

/** Edits in Ajustes reach the storefront within this many seconds. */
const ANNOUNCEMENT_REVALIDATE_SECONDS = 60;

const HIDDEN: StorefrontAnnouncement = { enabled: false, messages: [] };

/**
 * The marquee must never break a page: any failure (API down, bad payload)
 * collapses to "hidden". Public and cacheable, unlike the session reads.
 */
const getAnnouncement = async (): Promise<StorefrontAnnouncement> => {
  try {
    const { announcement } = expectData(
      await request<{ announcement: StorefrontAnnouncement }>(STOREFRONT_ANNOUNCEMENT_PATH, {
        next: { revalidate: ANNOUNCEMENT_REVALIDATE_SECONDS },
        timeoutMs: 3_000,
      }),
    );
    return announcement.enabled && announcement.messages.length > 0 ? announcement : HIDDEN;
  } catch {
    return HIDDEN;
  }
};

/** Edits in «Contenido de home» reach the storefront within this many seconds. */
const HERO_REVALIDATE_SECONDS = 60;

const NO_HERO: PublicStorefrontHero = { slides: [] };

/**
 * Like the marquee, the hero must never break the home: any failure collapses
 * to "no photos", and the page shows its brand-name fallback instead.
 */
const getHero = async (): Promise<PublicStorefrontHero> => {
  try {
    return expectData(
      await request<{ hero: PublicStorefrontHero }>(STOREFRONT_HERO_PATH, {
        next: { revalidate: HERO_REVALIDATE_SECONDS },
        timeoutMs: 3_000,
      }),
    ).hero;
  } catch {
    return NO_HERO;
  }
};

/** Products the team flagged «Más vendido» show within this many seconds of the flag. */
const BEST_SELLERS_REVALIDATE_SECONDS = 60;
const BEST_SELLERS_LIMIT = 12;
const BEST_SELLERS_QUERY = `?bestSeller=true&sort=-createdAt&limit=${BEST_SELLERS_LIMIT}`;

/**
 * Newest flagged products first (no ranking: the team decides). Like the hero,
 * the section must never break the home: any failure collapses to "none" and
 * the section simply is not drawn. A model with no purchasable variant has no
 * card, so it is dropped here.
 */
const getBestSellers = async (): Promise<PublicProductSummary[]> => {
  try {
    const { products } = expectData(
      await request<{ products: PublicProductSummary[] }>(`${CATALOG_PRODUCTS_PATH}${BEST_SELLERS_QUERY}`, {
        next: { revalidate: BEST_SELLERS_REVALIDATE_SECONDS },
        timeoutMs: 3_000,
      }),
    );
    return products.filter((product) => product.card !== undefined);
  } catch {
    return [];
  }
};

/** Category row of `GET /catalog/categories`. */
interface PublicCategorySummary {
  id: string;
  name: string;
  slug: string;
  description?: string;
  color: CategoryColor;
  /** Photo of the category tile; the team uploads it in the panel. */
  image?: { url: string; width: number; height: number };
}

const CATEGORIES_REVALIDATE_SECONDS = 60;

/** Like the other home reads: any failure collapses to "none" and the section is not drawn. */
const getCategories = async (): Promise<PublicCategorySummary[]> => {
  try {
    return expectData(
      await request<{ categories: PublicCategorySummary[] }>(`${CATALOG_CATEGORIES_PATH}?limit=24`, {
        next: { revalidate: CATEGORIES_REVALIDATE_SECONDS },
        timeoutMs: 3_000,
      }),
    ).categories;
  } catch {
    return [];
  }
};

export type { PublicCategorySummary };
export { getAnnouncement, getHero, getBestSellers, getCategories };
