import { ShippingLabelStatus } from "@gira/shared";
import { Order } from "../models/Order.js";
import { logger } from "../config/logger.js";
import {
  LABELABLE,
  LABEL_LEASE_MS,
  failStaleLease,
  processLabelCancellation,
  purchaseLabelForOrder,
} from "../services/shippingLabelService.js";

/**
 * Per-minute sweep over the labels:
 *   1. `requested` labels whose worker died (lease expired) -> needs_review: the
 *      outcome is UNKNOWN, so they are never re-bought automatically,
 *   2. purchases whose time came (pending / failed with nextAttemptAt due),
 *   3. pending cancellations.
 * Exported as a plain async function so tests drive it directly.
 */
const BATCH = 20;

const processShippingLabels = async (): Promise<void> => {
  const now = new Date();

  const stale = await Order.find({
    "label.status": ShippingLabelStatus.REQUESTED,
    "label.requestedAt": { $lt: new Date(now.getTime() - LABEL_LEASE_MS) },
  }).limit(BATCH);
  for (const order of stale) {
    try {
      await failStaleLease(order);
    } catch (err) {
      logger.error({ err, orderId: String(order._id) }, "Falló el cierre de un lease de guía");
    }
  }

  const due = await Order.find({
    status: { $in: LABELABLE },
    "label.status": { $in: [ShippingLabelStatus.PENDING, ShippingLabelStatus.FAILED] },
    "label.nextAttemptAt": { $lte: now },
  })
    .select("_id")
    .limit(BATCH)
    .lean();
  for (const { _id } of due) {
    try {
      await purchaseLabelForOrder(_id);
    } catch (err) {
      logger.error({ err, orderId: String(_id) }, "Falló la compra de guía en el job");
    }
  }

  const cancels = await Order.find({
    "label.status": ShippingLabelStatus.CANCEL_PENDING,
    "label.nextAttemptAt": { $lte: now },
  })
    .select("_id")
    .limit(BATCH)
    .lean();
  for (const { _id } of cancels) {
    try {
      await processLabelCancellation(_id);
    } catch (err) {
      logger.error({ err, orderId: String(_id) }, "Falló la cancelación de guía en el job");
    }
  }
};

export { processShippingLabels };
