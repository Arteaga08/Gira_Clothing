import type { ClientSession, Types } from "mongoose";
import { AuditAction, AuditModule } from "@gira/shared";
import { Variant } from "../models/Variant.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * The ONLY module allowed to write onHand. Every mutation is a single atomic
 * findOneAndUpdate whose filter carries the invariant `onHand - reserved >= 0`
 * (ECOMMERCE_ARCHITECTURE_GUIDELINES, "Inventario y concurrencia"). Never
 * read-then-write: the condition and the mutation must be one operation, or
 * two concurrent requests can both read a stale value and both "succeed",
 * silently losing a decrement or driving onHand negative.
 *
 * `reserved` is NOT written here: M2 only exposes admin stock adjustment.
 * Reserve/release/commit primitives belong to M3.
 *
 * Soft-deleted (isActive:false) variants remain adjustable — physical stock
 * exists regardless of catalog visibility, and blocking it would strand
 * inventory that a future reactivation needs to see correctly.
 */

const INSUFFICIENT = "Stock insuficiente: la operación dejaría unidades disponibles en negativo.";

interface StockView {
  id: string;
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
}

interface VariantStockLean {
  _id: unknown;
  sku: string;
  onHand: number;
  reserved: number;
}

const toStockView = (doc: VariantStockLean): StockView => ({
  id: String(doc._id),
  sku: doc.sku,
  onHand: doc.onHand,
  reserved: doc.reserved,
  available: doc.onHand - doc.reserved,
});

/** Absolute set. Guard is a plain filter: reserved must fit inside the new onHand. */
const setOnHand = async (
  variantId: string,
  onHand: number,
  ctx: RequestContext,
): Promise<StockView> => {
  const before = await Variant.findById(variantId).select("onHand reserved").lean();
  if (!before) throw new AppError("La variante no existe.", 404);

  const updated = await Variant.findOneAndUpdate(
    { _id: variantId, reserved: { $lte: onHand } },
    { $set: { onHand } },
    { new: true },
  )
    .select("sku onHand reserved")
    .lean();

  if (!updated) throw new AppError(INSUFFICIENT, 409);

  await recordAudit({
    actorId: ctx.actorId,
    actorType: ctx.actorId ? "user" : "system",
    action: AuditAction.STOCK_SET,
    module: AuditModule.INVENTORY,
    targetId: variantId,
    before: { onHand: before.onHand },
    after: { onHand: updated.onHand },
    ip: ctx.ip,
  });

  return toStockView(updated);
};

/** Relative adjustment. Condition: (onHand + delta) - reserved >= 0, checked atomically. */
const adjustOnHand = async (
  variantId: string,
  delta: number,
  ctx: RequestContext,
): Promise<StockView> => {
  const updated = await Variant.findOneAndUpdate(
    {
      _id: variantId,
      $expr: { $gte: [{ $subtract: [{ $add: ["$onHand", delta] }, "$reserved"] }, 0] },
    },
    { $inc: { onHand: delta } },
    { new: true },
  )
    .select("sku onHand reserved")
    .lean();

  if (!updated) {
    // Only reached on failure, so this extra read cannot race the atomic guard above.
    const exists = await Variant.exists({ _id: variantId });
    throw exists ? new AppError(INSUFFICIENT, 409) : new AppError("La variante no existe.", 404);
  }

  await recordAudit({
    actorId: ctx.actorId,
    actorType: ctx.actorId ? "user" : "system",
    action: AuditAction.STOCK_ADJUSTED,
    module: AuditModule.INVENTORY,
    targetId: variantId,
    before: { onHand: updated.onHand - delta },
    after: { onHand: updated.onHand },
    ip: ctx.ip,
  });

  return toStockView(updated);
};

/**
 * Puts units BACK, inside a caller-owned transaction. Separate from
 * `adjustOnHand` on purpose:
 *
 *  - It takes a session, so the restock and the order's own status change land
 *    as ONE unit of work. A refund that reposts two of three lines and then
 *    throws used to leave the books permanently wrong, with no retry behind it
 *    (the webhook event was already claimed).
 *  - It needs no availability guard: adding units can never drive
 *    `onHand - reserved` negative, which is the only invariant here.
 *  - It does NOT audit per line. The caller records one entry for the whole
 *    refund — auditing inside a transaction that may still abort would leave a
 *    trail of things that never happened.
 *
 * A line whose variant no longer exists is a silent no-op rather than a throw:
 * blocking a refund on a missing catalog row helps nobody, and the caller's
 * audit entry is what tells the admin to reconcile by hand.
 */
const restockUnits = async (
  lines: readonly { variant: Types.ObjectId; qty: number }[],
  session: ClientSession,
): Promise<void> => {
  for (const line of lines) {
    await Variant.updateOne({ _id: line.variant }, { $inc: { onHand: line.qty } }, { session });
  }
};

export type { StockView };
export { setOnHand, adjustOnHand, restockUnits };
