import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

/**
 * One saved variant of one account. Stored as a row per item (not an array on
 * the user) so the unique { user, variant } index makes "no duplicates"
 * atomic. Nothing but the pair is stored: price, photo and availability are
 * resolved live on every read.
 */

interface WishlistAttrs {
  user: Types.ObjectId;
  variant: Types.ObjectId;
}

type WishlistModel = Model<WishlistAttrs>;
type WishlistDocument = HydratedDocument<WishlistAttrs>;

const wishlistSchema = new Schema<WishlistAttrs, WishlistModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    variant: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
  },
  { timestamps: true },
);

wishlistSchema.index({ user: 1, variant: 1 }, { unique: true });

const Wishlist = model<WishlistAttrs, WishlistModel>("Wishlist", wishlistSchema);

export type { WishlistAttrs, WishlistDocument };
export { Wishlist };
