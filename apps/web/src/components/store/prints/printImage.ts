/** Print photos are macro shots in landscape: drawn at most this wide, never cropped by the CDN. */
const PRINT_TRANSFORM = "c_limit,w_1600,f_auto,q_auto";
const UPLOAD_SEGMENT = "/image/upload/";

/** Asks Cloudinary for the web size. Any other URL (not Cloudinary, already transformed) goes through as is. */
const printImageUrl = (url: string): string => {
  const at = url.indexOf(UPLOAD_SEGMENT);
  if (at === -1) return url;
  const rest = url.slice(at + UPLOAD_SEGMENT.length);
  if (/^[a-z]_[^/]*\//.test(rest)) return url;
  return `${url.slice(0, at + UPLOAD_SEGMENT.length)}${PRINT_TRANSFORM}/${rest}`;
};

export { printImageUrl };
