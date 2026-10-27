const UPLOAD_SEGMENT = "/image/upload/";

/**
 * Cloudinary URL for the size photo: never cropped (a diagram loses its
 * measurements if it is), only capped to `width`, in the best format. Any other
 * URL (not Cloudinary, already transformed) goes through as is.
 */
const sizeImageUrl = (url: string, width: number): string => {
  const at = url.indexOf(UPLOAD_SEGMENT);
  if (at === -1) return url;
  const rest = url.slice(at + UPLOAD_SEGMENT.length);
  if (/^[a-z]_[^/]*\//.test(rest)) return url;
  return `${url.slice(0, at + UPLOAD_SEGMENT.length)}c_limit,w_${width},f_auto,q_auto/${rest}`;
};

export { sizeImageUrl };
