import {
  OFFER_ALT_MAX_LENGTH,
  OFFER_BUTTON_MAX_LENGTH,
  OFFER_MESSAGE_MAX_LENGTH,
  type StorefrontOfferBanner,
} from "@gira/shared";

/**
 * Offer banner form helpers. The draft keeps what the team typed as is;
 * `parseOfferBanner` trims it and applies the same rules as the API, so a
 * mistake shows in the modal before a round trip.
 */

type OfferBannerParseResult = { banner: StorefrontOfferBanner } | { error: string };

const OFFER_INCOMPLETE = "Para mostrar el banner completa la foto, su descripción, la frase y el botón.";

const trimBanner = (draft: StorefrontOfferBanner): StorefrontOfferBanner => ({
  enabled: draft.enabled,
  image: draft.image,
  alt: draft.alt.trim(),
  message: draft.message.trim(),
  buttonLabel: draft.buttonLabel.trim(),
  productId: draft.productId || null,
});

/** Equal signatures mean nothing changed; leading or trailing spaces do not count. */
const offerBannerSignature = (draft: StorefrontOfferBanner): string => JSON.stringify(trimBanner(draft));

const parseOfferBanner = (draft: StorefrontOfferBanner): OfferBannerParseResult => {
  const banner = trimBanner(draft);
  if (banner.alt.length > OFFER_ALT_MAX_LENGTH) {
    return { error: `La descripción de la foto admite hasta ${OFFER_ALT_MAX_LENGTH} caracteres.` };
  }
  if (banner.message.length > OFFER_MESSAGE_MAX_LENGTH) {
    return { error: `La frase admite hasta ${OFFER_MESSAGE_MAX_LENGTH} caracteres.` };
  }
  if (banner.buttonLabel.length > OFFER_BUTTON_MAX_LENGTH) {
    return { error: `El texto del botón admite hasta ${OFFER_BUTTON_MAX_LENGTH} caracteres.` };
  }
  if (banner.enabled && (!banner.image || !banner.alt || !banner.message || !banner.buttonLabel)) {
    return { error: OFFER_INCOMPLETE };
  }
  return { banner };
};

export type { OfferBannerParseResult };
export { offerBannerSignature, parseOfferBanner };
