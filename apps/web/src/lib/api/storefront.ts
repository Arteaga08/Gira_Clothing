import { PRINT_HOME_POSITION_MAX, type ApiMeta, type CategoryColor, type PublicEvents, type PublicOfferBanner, type PublicProductSummary, type PublicStorefrontHero, type StorefrontAnnouncement } from "@gira/shared";
import { buildCatalogApiQuery, CATALOG_PAGE_SIZE, type CatalogQuery } from "@/lib/store/catalogQuery";
import { ApiError } from "./ApiError";
import { request, expectData } from "./request";
import { CATALOG_CATEGORIES_PATH, CATALOG_PRINTS_PATH, CATALOG_PRODUCTS_PATH, STOREFRONT_ANNOUNCEMENT_PATH, STOREFRONT_EVENTS_PATH, STOREFRONT_HERO_PATH, STOREFRONT_OFFER_BANNER_PATH } from "./paths";

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

/** Edits in «Contenido de home» reach the storefront within this many seconds. */
const OFFER_BANNER_REVALIDATE_SECONDS = 60;

/**
 * The offer banner, or null when it is hidden. Like the hero, it must never
 * break the home: any failure collapses to null and the section is skipped.
 */
const getOfferBanner = async (): Promise<PublicOfferBanner | null> => {
  try {
    return expectData(
      await request<{ banner: PublicOfferBanner | null }>(STOREFRONT_OFFER_BANNER_PATH, {
        next: { revalidate: OFFER_BANNER_REVALIDATE_SECONDS },
        timeoutMs: 3_000,
      }),
    ).banner;
  } catch {
    return null;
  }
};

/** Edits in «Contenido de home» reach the storefront within this many seconds. */
const EVENTS_REVALIDATE_SECONDS = 60;

/**
 * The upcoming events (past days are dropped by the API). Like the banner, they
 * must never break the home: any failure collapses to null and the section is skipped.
 */
const getEvents = async (): Promise<PublicEvents | null> => {
  try {
    return expectData(
      await request<{ events: PublicEvents }>(STOREFRONT_EVENTS_PATH, {
        next: { revalidate: EVENTS_REVALIDATE_SECONDS },
        timeoutMs: 3_000,
      }),
    ).events;
  } catch {
    return null;
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

/** Catalog edits (prices, flags, stock) reach the listing within this many seconds. */
const CATALOG_REVALIDATE_SECONDS = 60;

type CatalogPageResult =
  | { status: "ok"; products: PublicProductSummary[]; meta: ApiMeta }
  | { status: "error" };

/**
 * One page of the catalog. A category or print slug the API does not know
 * (404) is an empty result, not a failure: the page says "nothing here". Any
 * other failure is reported as `error` so the page can offer a retry. A model
 * with no purchasable variant has no card and is dropped.
 */
const getCatalogPage = async (query: CatalogQuery): Promise<CatalogPageResult> => {
  try {
    const result = await request<{ products: PublicProductSummary[] }>(`${CATALOG_PRODUCTS_PATH}${buildCatalogApiQuery(query)}`, {
      next: { revalidate: CATALOG_REVALIDATE_SECONDS },
      timeoutMs: 5_000,
    });
    const { products } = expectData(result);
    const meta = result.meta ?? { total: products.length, page: query.page, pages: 1, limit: CATALOG_PAGE_SIZE };
    return { status: "ok", products: products.filter((product) => product.card !== undefined), meta };
  } catch (error) {
    if (error instanceof ApiError && error.kind === "http" && error.status === 404) {
      return { status: "ok", products: [], meta: { total: 0, page: 1, pages: 1, limit: CATALOG_PAGE_SIZE } };
    }
    return { status: "error" };
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

export type { CatalogPageResult, PublicCategorySummary, PublicPrintSummary };
export { getAnnouncement, getHero, getOfferBanner, getEvents, getBestSellers, getNewArrivals, getCatalogPage, getCategories, getFeaturedPrints };
