import type { PublicStorefrontHero, StorefrontAnnouncement } from "@gira/shared";
import { request, expectData } from "./request";
import { STOREFRONT_ANNOUNCEMENT_PATH, STOREFRONT_HERO_PATH } from "./paths";

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

export { getAnnouncement, getHero };
