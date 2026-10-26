import { PRINT_HOME_POSITION_MAX, type CategoryColor, type PublicProductSummary, type PublicStorefrontHero, type StorefrontAnnouncement } from "@gira/shared";
import { request, expectData } from "./request";
import { CATALOG_CATEGORIES_PATH, CATALOG_PRINTS_PATH, CATALOG_PRODUCTS_PATH, STOREFRONT_ANNOUNCEMENT_PATH, STOREFRONT_HERO_PATH } from "./paths";

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

/** Products flagged «Novedad» show within this many seconds of the flag. */
const NEW_ARRIVALS_REVALIDATE_SECONDS = 60;
/** «Novedades» draws one large tile and up to four small ones. */
const NEW_ARRIVALS_LIMIT = 5;
const NEW_ARRIVALS_QUERY = `?newArrival=true&sort=-createdAt&limit=${NEW_ARRIVALS_LIMIT}`;

/** Products flagged «Novedad», newest first; like the other home reads, any failure means "none". */
const getNewArrivals = async (): Promise<PublicProductSummary[]> => {
  try {
    const { products } = expectData(
      await request<{ products: PublicProductSummary[] }>(`${CATALOG_PRODUCTS_PATH}${NEW_ARRIVALS_QUERY}`, {
        next: { revalidate: NEW_ARRIVALS_REVALIDATE_SECONDS },
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

/** Print row of `GET /catalog/prints`: the macro photo is mandatory in the model. */
interface PublicPrintSummary {
  id: string;
  name: string;
  slug: string;
  sku: string;
  family: { id: string; name: string; slug: string };
  image: { url: string; width: number; height: number };
  /** Line under the name in the home: the print's own text, or its family description. */
  blurb?: string;
}

const FEATURED_PRINTS_REVALIDATE_SECONDS = 60;
const FEATURED_PRINTS_QUERY = `?featured=true&limit=${PRINT_HOME_POSITION_MAX}`;

/**
 * Prints the team placed in the home (Estampas screen, «Posición en la home»),
 * in slot order. Like the other home reads: any failure collapses to "none"
 * and the section is not drawn.
 */
const getFeaturedPrints = async (): Promise<PublicPrintSummary[]> => {
  try {
    return expectData(
      await request<{ prints: PublicPrintSummary[] }>(`${CATALOG_PRINTS_PATH}${FEATURED_PRINTS_QUERY}`, {
        next: { revalidate: FEATURED_PRINTS_REVALIDATE_SECONDS },
        timeoutMs: 3_000,
      }),
    ).prints;
  } catch {
    return [];
  }
};

export type { PublicCategorySummary, PublicPrintSummary };
export { getAnnouncement, getHero, getBestSellers, getNewArrivals, getCategories, getFeaturedPrints };
