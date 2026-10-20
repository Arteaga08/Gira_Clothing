import { Types } from "mongoose";
import { NotificationChannelKind, NotificationType, stockStatusOf } from "@gira/shared";
import { Variant, type StockAlertLevel } from "../models/Variant.js";
import { enqueueNotification } from "./notificationService.js";
import { getSettings } from "./settingsService.js";
import { logger } from "../config/logger.js";

/**
 * One Telegram ping per stock drop. The outbox has no per-variant dedupe (its
 * unique index only covers messages that belong to an order), so the
 * exactly-once guarantee lives HERE: the alert level is claimed with a single
 * findOneAndUpdate whose filter re-checks the current availability. Two
 * concurrent callers, or a stale read, can never both win or claim a level the
 * variant has already left.
 *
 * Levels only notify when they get worse. Climbing back (out -> low) changes
 * nothing; going over the threshold re-arms it (null) so the next drop pings again.
 */

const AVAILABLE = { $subtract: ["$onHand", "$reserved"] };

const availabilityFilter = (
  level: StockAlertLevel,
  threshold: number,
): Record<string, unknown> => ({
  $expr:
    level === "out"
      ? { $lte: [AVAILABLE, 0] }
      : { $and: [{ $gt: [AVAILABLE, 0] }, { $lte: [AVAILABLE, threshold] }] },
});

/**
 * Levels only notify when they get worse. Once "out" was announced the marker
 * stays "out" through a partial recovery (out -> low is silent AND leaves the
 * marker alone), so a reserve/expire/reserve cycle cannot ping again: only
 * climbing over the threshold re-arms it.
 */
const claimableFrom = (status: StockAlertLevel): Record<string, unknown> =>
  status === "out" ? { $ne: "out" } : { $nin: ["low", "out"] };

const evaluateOne = async (variantId: string, threshold: number): Promise<void> => {
  const id = new Types.ObjectId(variantId);
  const current = await Variant.findById(id).select("onHand reserved").lean();
  if (!current) return;

  const status = stockStatusOf(current.onHand - current.reserved, threshold);

  if (status === "ok") {
    // Re-arm only while still over the threshold at write time.
    await Variant.updateOne(
      {
        _id: id,
        stockAlertLevel: { $in: ["low", "out"] },
        $expr: { $gt: [AVAILABLE, threshold] },
      },
      { $set: { stockAlertLevel: null } },
    );
    return;
  }

  const claimed = await Variant.findOneAndUpdate(
    { _id: id, stockAlertLevel: claimableFrom(status), ...availabilityFilter(status, threshold) },
    { $set: { stockAlertLevel: status, stockAlertedAt: new Date() } },
    { new: false },
  )
    .select("sku product print onHand reserved stockAlertLevel")
    .populate<{ product: { name: string } }>("product", "name")
    .populate<{ print: { name: string } }>("print", "name")
    .lean();
  if (!claimed) return;

  let queued = false;
  try {
    queued = await enqueueNotification({
      channel: NotificationChannelKind.TEAM,
      type: status === "out" ? NotificationType.TEAM_STOCK_OUT : NotificationType.TEAM_STOCK_LOW,
      to: "team",
      payload: {
        sku: claimed.sku,
        productName: claimed.product?.name ?? "",
        printName: claimed.print?.name ?? "",
        available: current.onHand - current.reserved,
        threshold,
      },
    });
  } catch (err) {
    logger.error({ err, variant: variantId }, "No se pudo encolar la alerta de stock");
  }

  // The ping never made it into the outbox: give the claim back so the next
  // evaluation tries again instead of silently swallowing the alert.
  if (!queued) {
    await Variant.updateOne(
      { _id: id, stockAlertLevel: status },
      { $set: { stockAlertLevel: claimed.stockAlertLevel ?? null } },
    );
  }
};

/**
 * Never throws: stock bookkeeping must not fail an adjustment, a checkout or a
 * refund that already committed. Call it AFTER the transaction, never inside.
 */
const evaluateStockAlerts = async (variantIds: readonly string[]): Promise<void> => {
  try {
    const threshold = (await getSettings()).inventory.lowStockThreshold;
    for (const id of new Set(variantIds)) {
      try {
        await evaluateOne(id, threshold);
      } catch (err) {
        logger.error({ err, variant: id }, "No se pudo evaluar la alerta de stock");
      }
    }
  } catch (err) {
    logger.error({ err }, "No se pudo evaluar la alerta de stock");
  }
};

export { evaluateStockAlerts };
