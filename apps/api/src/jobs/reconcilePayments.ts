import { PaymentStatus, OrderStatus } from "@gira/shared";
import { Order } from "../models/Order.js";
import { getPaymentProvider } from "../adapters/payment/index.js";
import { applyPaymentSucceeded, applyPaymentCancelled } from "../services/orderPaymentService.js";
import { logger } from "../config/logger.js";

/**
 * The safety net for a webhook that never arrived (provider outage, our own
 * downtime, a misconfigured endpoint). Asks the provider for the real state of
 * every stale pending payment and applies the SAME effects the webhook would —
 * by calling orderPaymentService, never by reimplementing them. A grace window
 * skips brand-new orders: the customer is still mid-checkout, and polling them
 * this early would just be wasted provider calls.
 */
const GRACE_MINUTES = 15;
const BATCH = 100;

const reconcilePayments = async (): Promise<{ checked: number; settled: number }> => {
  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60 * 1000);
  const stale = await Order.find({
    status: OrderStatus.PENDING_PAYMENT,
    "payment.intentId": { $exists: true },
    createdAt: { $lt: cutoff },
  })
    .select("_id payment.intentId")
    .limit(BATCH)
    .lean();

  const provider = getPaymentProvider();
  let settled = 0;

  for (const order of stale) {
    try {
      const payment = await provider.getPayment(order.payment.intentId!);
      if (payment.status === PaymentStatus.SUCCEEDED) {
        await applyPaymentSucceeded(order._id);
        settled += 1;
      } else if (payment.status === PaymentStatus.CANCELLED) {
        await applyPaymentCancelled(order._id);
        settled += 1;
      }
      // requires_payment / processing: still genuinely pending, leave as is.
    } catch (err) {
      // One bad lookup must not stop the sweep.
      logger.error({ err, order: order._id }, "No se pudo conciliar el pago");
    }
  }
  return { checked: stale.length, settled };
};

export { reconcilePayments };
