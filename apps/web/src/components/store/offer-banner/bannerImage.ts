/** The banner runs edge to edge: drawn at most this wide, never cropped by the CDN (CSS crops it). */
const BANNER_TRANSFORM = "c_limit,w_2400,f_auto,q_auto";
const UPLOAD_SEGMENT = "/image/upload/";

/** Asks Cloudinary for the web size. Any other URL (not Cloudinary, already transformed) goes through as is. */
const bannerImageUrl = (url: string): string => {
  const at = url.indexOf(UPLOAD_SEGMENT);
  if (at === -1) return url;
  const rest = url.slice(at + UPLOAD_SEGMENT.length);
  if (/^[a-z]_[^/]*\//.test(rest)) return url;
  return `${url.slice(0, at + UPLOAD_SEGMENT.length)}${BANNER_TRANSFORM}/${rest}`;
};

export { bannerImageUrl };
