import type { PublicProductCard } from "./catalog.js";

/** One saved variant of `GET /wishlist`: the live card plus what names it. */
interface WishlistItem extends PublicProductCard {
  productName: string;
  productSlug: string;
  printName: string;
}

export type { WishlistItem };
