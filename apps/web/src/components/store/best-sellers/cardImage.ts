/** Card photos are drawn at most this wide (4:5); Cloudinary serves exactly that, in the best format. */
const CARD_WIDTH = 640;
const cardTransform = (width: number): string => `c_fill,w_${width},h_${Math.round((width * 5) / 4)},f_auto,q_auto`;
const UPLOAD_SEGMENT = "/image/upload/";

/**
 * Asks Cloudinary for the card crop (4:5, `width` wide; a larger tile asks for
 * more). Any other URL (not Cloudinary, already transformed) goes through as is.
 */
const cardImageUrl = (url: string, width: number = CARD_WIDTH): string => {
  const at = url.indexOf(UPLOAD_SEGMENT);
  if (at === -1) return url;
  const rest = url.slice(at + UPLOAD_SEGMENT.length);
  // A transformation segment has no dot and no version; `v123/...` or a folder means there is none yet.
  if (/^[a-z]_[^/]*\//.test(rest)) return url;
  return `${url.slice(0, at + UPLOAD_SEGMENT.length)}${cardTransform(width)}/${rest}`;
};

export { cardImageUrl };
