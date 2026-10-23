import type { StorefrontAnnouncement } from "@gira/shared";
import { request, expectData } from "./request";
import { STOREFRONT_ANNOUNCEMENT_PATH } from "./paths";

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

export { getAnnouncement };
