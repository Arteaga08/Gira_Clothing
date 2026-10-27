import { WISHLIST_MAX_ITEMS, type WishlistItem } from "@gira/shared";
import { Types } from "mongoose";
import { Wishlist } from "../models/Wishlist.js";
import { Variant } from "../models/Variant.js";
import { AppError } from "../utils/AppError.js";
import type { PricedProduct } from "../utils/unitPrice.js";
import { toPublicProductCard, type CardVariantLean } from "./catalogService.js";

/**
 * Saved variants of an account. A row is just { user, variant }; everything the
 * customer sees is resolved LIVE against the catalog on read, with the same
 * price rule as the cards (toPublicProductCard -> resolveUnitPrice).
 *
 * Visibility on read: a variant whose variant, product or print is inactive is
 * hidden (the row stays, so it comes back if the team reactivates it). A
 * sold-out one stays, flagged `isAvailable: false`.
 */

interface SavedProduct extends PricedProduct {
  name: string;
  slug: string;
  isActive: boolean;
}

interface SavedPrint {
  _id: Types.ObjectId;
  name: string;
  image: CardVariantLean["print"]["image"];
  isActive: boolean;
}

type SavedVariant = Omit<CardVariantLean, "product" | "print"> & {
  product: SavedProduct;
  print: SavedPrint;
};

/** Loads the saved variants that are still on sale, keyed by id, in one query. */
const loadVisibleVariants = async (variantIds: Types.ObjectId[]): Promise<Map<string, SavedVariant>> => {
  if (variantIds.length === 0) return new Map();
  const variants = (await Variant.find({ _id: { $in: variantIds }, isActive: true })
    .populate("product", "name slug basePrice salePrice isActive")
    .populate("print", "name image isActive")
    .lean()) as unknown as SavedVariant[];
  return new Map(
    variants
      .filter((variant) => variant.product?.isActive && variant.print?.isActive)
      .map((variant) => [String(variant._id), variant]),
  );
};

const listWishlist = async (userId: Types.ObjectId): Promise<WishlistItem[]> => {
  const rows = await Wishlist.find({ user: userId }).sort({ createdAt: -1, _id: -1 }).lean();
  const visible = await loadVisibleVariants(rows.map((row) => row.variant));

  const items: WishlistItem[] = [];
  for (const row of rows) {
    const variant = visible.get(String(row.variant));
    if (!variant) continue;
    items.push({
      ...toPublicProductCard(variant, variant.product),
      productName: variant.product.name,
      productSlug: variant.product.slug,
      printName: variant.print.name,
    });
  }
  return items;
};

/** Ids only, for painting the hearts; same visibility as the full list. */
const listWishlistIds = async (userId: Types.ObjectId): Promise<string[]> => {
  const rows = await Wishlist.find({ user: userId }).select("variant").lean();
  const visible = await loadVisibleVariants(rows.map((row) => row.variant));
  return rows.map((row) => String(row.variant)).filter((id) => visible.has(id));
};

/** Idempotent: saving what is already saved is a no-op, and does not count against the cap. */
const addWishlistItem = async (userId: Types.ObjectId, variantId: string): Promise<void> => {
  const variantObjectId = new Types.ObjectId(variantId);
  const visible = await loadVisibleVariants([variantObjectId]);
  if (!visible.has(variantId)) throw new AppError("El producto no está disponible para guardar.", 404);

  if (await Wishlist.exists({ user: userId, variant: variantObjectId })) return;
  if ((await Wishlist.countDocuments({ user: userId })) >= WISHLIST_MAX_ITEMS) {
    throw new AppError(`Puedes guardar hasta ${WISHLIST_MAX_ITEMS} productos. Quita alguno para agregar otro.`, 400);
  }

  try {
    await Wishlist.create({ user: userId, variant: variantObjectId });
  } catch (error) {
    // A concurrent identical request won the race: same end state, so success.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
};

const removeWishlistItem = async (userId: Types.ObjectId, variantId: string): Promise<void> => {
  await Wishlist.deleteOne({ user: userId, variant: new Types.ObjectId(variantId) });
};

export { listWishlist, listWishlistIds, addWishlistItem, removeWishlistItem };
