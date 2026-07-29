import { Types } from "mongoose";
import { Cart, type CartLine } from "../models/Cart.js";
import { Variant } from "../models/Variant.js";
import { AppError } from "../utils/AppError.js";
import { getSettings } from "./settingsService.js";
import { resolveOrderLines } from "./pricingService.js";
import type { ImageAttrs } from "../models/schemas/image.js";

/**
 * Cart read/write. Prices and availability are always resolved LIVE against the
 * catalog on read — a cart line is just `{variant, qty}`, never a frozen price.
 * Sellability (variant + parents active) is validated on WRITE by delegating to
 * pricingService.resolveOrderLines — the exact same rule the order will apply,
 * so a line that makes it into the cart is guaranteed sellable at write time.
 */

const MAX_LINES = 30;

interface ProductRef {
  _id: Types.ObjectId;
  name: string;
  basePrice: number;
}

interface PrintRef {
  _id: Types.ObjectId;
  name: string;
}

interface CartLineView {
  variantId: string;
  sku: string;
  productName: string;
  printName: string;
  image?: ImageAttrs;
  qty: number;
  unitPriceMxn: number;
  available: number;
  isAvailable: boolean;
}

interface CartView {
  lines: CartLineView[];
}

const touchExpiry = async (): Promise<Date> => {
  const { reservation } = await getSettings();
  return new Date(Date.now() + reservation.cartInactivityDays * 24 * 60 * 60 * 1000);
};

/**
 * Resolves live catalog data for each line. A line whose variant no longer
 * exists (hard-deleted, never happens via the API but defensive nonetheless)
 * is silently dropped from the view rather than failing the whole cart.
 */
const buildCartView = async (lines: CartLine[]): Promise<CartView> => {
  if (lines.length === 0) return { lines: [] };

  const ids = lines.map((l) => l.variant);
  const variants = await Variant.find({ _id: { $in: ids } })
    .populate("product", "name basePrice")
    .populate("print", "name")
    .lean();
  const byId = new Map(variants.map((v) => [String(v._id), v]));

  const views: CartLineView[] = [];
  for (const line of lines) {
    const variant = byId.get(String(line.variant));
    if (!variant) continue;

    const product = variant.product as unknown as ProductRef;
    const print = variant.print as unknown as PrintRef;
    const available = variant.onHand - variant.reserved;

    views.push({
      variantId: String(variant._id),
      sku: variant.sku,
      productName: product.name,
      printName: print.name,
      ...(variant.images[0] ? { image: variant.images[0] } : {}),
      qty: line.qty,
      unitPriceMxn: variant.priceOverride ?? product.basePrice,
      available,
      isAvailable: available > 0,
    });
  }
  return { lines: views };
};

const getCart = async (userId: Types.ObjectId): Promise<CartView> => {
  const cart = await Cart.findOne({ user: userId }).lean();
  if (!cart) return { lines: [] };
  return buildCartView(cart.lines);
};

/** Absolute set, not an increment: a retried "add" must not double the quantity. */
const setCartLine = async (
  userId: Types.ObjectId,
  variantId: string,
  qty: number,
): Promise<CartView> => {
  const expiresAt = await touchExpiry();
  const variantObjectId = new Types.ObjectId(variantId);

  if (qty === 0) {
    await Cart.updateOne(
      { user: userId },
      { $pull: { lines: { variant: variantObjectId } }, $set: { expiresAt } },
    );
    return getCart(userId);
  }

  // Validates the variant exists and is sellable (400/409) — the same rule
  // orderService applies at checkout.
  await resolveOrderLines([{ variantId, qty }]);

  const cart = await Cart.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, lines: [] }, $set: { expiresAt } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const existingIndex = cart.lines.findIndex((l) => l.variant.equals(variantObjectId));
  if (existingIndex === -1 && cart.lines.length >= MAX_LINES) {
    throw new AppError("Tu carrito alcanzó el máximo de artículos distintos.", 400);
  }

  if (existingIndex >= 0) {
    cart.lines[existingIndex]!.qty = qty;
  } else {
    cart.lines.push({ variant: variantObjectId, qty });
  }
  await cart.save();

  return buildCartView(cart.lines);
};

const removeCartLine = async (userId: Types.ObjectId, variantId: string): Promise<CartView> => {
  const expiresAt = await touchExpiry();
  await Cart.updateOne(
    { user: userId },
    { $pull: { lines: { variant: new Types.ObjectId(variantId) } }, $set: { expiresAt } },
  );
  return getCart(userId);
};

const clearCart = async (userId: Types.ObjectId): Promise<CartView> => {
  const expiresAt = await touchExpiry();
  await Cart.updateOne({ user: userId }, { $set: { lines: [], expiresAt } });
  return { lines: [] };
};

export type { CartView, CartLineView };
export { getCart, setCartLine, removeCartLine, clearCart };
