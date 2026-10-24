/** Card photos are drawn at most this wide; Cloudinary serves exactly that, in the best format. */
const CARD_TRANSFORM = "c_fill,w_640,h_800,f_auto,q_auto";
const UPLOAD_SEGMENT = "/image/upload/";

/** Asks Cloudinary for the card crop. Any other URL (not Cloudinary, already transformed) goes through as is. */
const cardImageUrl = (url: string): string => {
  const at = url.indexOf(UPLOAD_SEGMENT);
  if (at === -1) return url;
  const rest = url.slice(at + UPLOAD_SEGMENT.length);
  // A transformation segment has no dot and no version; `v123/...` or a folder means there is none yet.
  if (/^[a-z]_[^/]*\//.test(rest)) return url;
  return `${url.slice(0, at + UPLOAD_SEGMENT.length)}${CARD_TRANSFORM}/${rest}`;
};

export { cardImageUrl };
