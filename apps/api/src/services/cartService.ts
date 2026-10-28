import { Types } from "mongoose";
import { CART_MAX_LINES, CartLineStatus, type CartLineView, type CartView } from "@gira/shared";
import { Cart } from "../models/Cart.js";
import { Variant } from "../models/Variant.js";
import { AppError } from "../utils/AppError.js";
import { getSettings } from "./settingsService.js";
import { resolveUnitPrice } from "../utils/unitPrice.js";

/**
 * Cart read/write. Prices and availability are always resolved LIVE against the
 * catalog on read — a cart line is just `{variant, qty}`, never a frozen price.
 *
 * Contract (M16): a write is refused with 410 only when the variant is gone for
 * good (missing, or it, its product or its print inactive). Stock is NOT checked
 * on write: an out-of-stock line is kept and flagged on read, because stock comes
 * back and the order re-checks it atomically when it reserves.
 */

const RETIRED_MESSAGE = "Este producto ya no está disponible.";

interface ProductRef {
  _id: Types.ObjectId;
  name: string;
  basePrice: number;
  salePrice?: number;
  isActive: boolean;
}

interface PrintRef {
  _id: Types.ObjectId;
  name: string;
  isActive: boolean;
}

interface LineRef {
  variant: Types.ObjectId;
  qty: number;
}

const touchExpiry = async (): Promise<Date> => {
  const { reservation } = await getSettings();
  return new Date(Date.now() + reservation.cartInactivityDays * 24 * 60 * 60 * 1000);
};

const loadVariants = (ids: Types.ObjectId[]) =>
  Variant.find({ _id: { $in: ids } })
    .populate("product", "name basePrice salePrice isActive")
    .populate("print", "name isActive")
    .lean();

/**
 * `account`: the customer's own cart. A retired line keeps its name and photo
 * (they put it there) and stock is compared against the quantity.
 * `public`: the anonymous preview, which takes any id. A retired line is bare
 * (no unreleased product leaks by guessing ids) and availability is the same
 * yes/no signal the catalog gives, never a number to binary-search.
 */
type CartAudience = "account" | "public";

/**
 * Resolves live catalog data for each line, in the order given. Never fails on
 * one line: a hard-deleted variant (or parent) comes back as a bare `retired`
 * line so the customer can still see that something left and remove it.
 */
const buildCartView = async (lines: LineRef[], audience: CartAudience = "account"): Promise<CartView> => {
  if (lines.length === 0) return { lines: [] };

  const variants = await loadVariants(lines.map((l) => l.variant));
  const byId = new Map(variants.map((v) => [String(v._id), v]));

  const views = lines.map((line): CartLineView => {
    const variantId = String(line.variant);
    const bare: CartLineView = { variantId, qty: line.qty, status: CartLineStatus.RETIRED };
    const variant = byId.get(variantId);
    // populate() leaves null when a parent was hard-deleted.
    const product = variant?.product as unknown as ProductRef | null | undefined;
    const print = variant?.print as unknown as PrintRef | null | undefined;
    if (!variant || !product || !print) return bare;

    const retired = !variant.isActive || !product.isActive || !print.isActive;
    if (retired && audience === "public") return bare;
    const wanted = audience === "public" ? 1 : line.qty;
    const inStock = variant.onHand - variant.reserved >= wanted;

    return {
      variantId,
      qty: line.qty,
      status: retired
        ? CartLineStatus.RETIRED
        : inStock
          ? CartLineStatus.AVAILABLE
          : CartLineStatus.OUT_OF_STOCK,
      sku: variant.sku,
      productName: product.name,
      printName: print.name,
      ...(variant.images[0] ? { image: variant.images[0] } : {}),
      unitPriceMxn: resolveUnitPrice(product, variant.priceOverride).priceMxn,
    };
  });
  return { lines: views };
};

/** 410 when the variant can never be bought again; stock is deliberately ignored. */
const assertNotRetired = async (variantId: Types.ObjectId): Promise<void> => {
  const [variant] = await loadVariants([variantId]);
  const product = variant?.product as unknown as ProductRef | undefined;
  const print = variant?.print as unknown as PrintRef | undefined;
  if (!variant?.isActive || !product?.isActive || !print?.isActive) {
    throw new AppError(RETIRED_MESSAGE, 410);
  }
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

  await assertNotRetired(variantObjectId);

  const cart = await Cart.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, lines: [] }, $set: { expiresAt } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const existingIndex = cart.lines.findIndex((l) => l.variant.equals(variantObjectId));
  if (existingIndex === -1 && cart.lines.length >= CART_MAX_LINES) {
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

/** Guest cart read: the browser only stores `{variantId, qty}`. */
const previewCart = (lines: { variantId: string; qty: number }[]): Promise<CartView> =>
  buildCartView(
    lines.map((l) => ({ variant: new Types.ObjectId(l.variantId), qty: l.qty })),
    "public",
  );

export { getCart, setCartLine, removeCartLine, clearCart, previewCart };
