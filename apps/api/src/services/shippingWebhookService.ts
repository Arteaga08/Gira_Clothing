import { getShippingProvider } from "../adapters/shipping/index.js";
import type { WebhookHeaders } from "../adapters/shipping/types.js";
import { AppError } from "../utils/AppError.js";
import { runWebhookEvent } from "./webhookEventService.js";
import { applyTrackingEvents } from "./shipmentTrackingService.js";
import { Order } from "../models/Order.js";

/**
 * Entry point for the carrier-tracking webhook. Verification and parsing live in
 * the adapter; dedupe in `runWebhookEvent`; the business effect in
 * `shipmentTrackingService`. Only DB work happens before answering (the provider
 * gives 5 s).
 */
const handleShippingWebhook = async (
  rawBody: Buffer,
  headers: WebhookHeaders,
): Promise<"processed" | "duplicate"> => {
  const provider = getShippingProvider();
  if (!provider.acceptsWebhooks) {
    throw new AppError("El rastreo por webhook no está configurado.", 503);
  }

  // Throws AppError(400) on a bad signature, stale timestamp or missing headers.
  const parsed = provider.verifyAndParseWebhook(rawBody, headers);

  return runWebhookEvent(
    provider.name,
    { id: parsed.deliveryId, type: parsed.eventType, ignored: parsed.events.length === 0 },
    async () => {
      // The delivery id dedupes at the WebhookEvent level only; stored events use the fact's own key.
      await applyTrackingEvents(provider.name, parsed.events);
      const first = parsed.events[0];
      if (!first) return null;
      const order = await Order.findOne({ "label.trackingNumber": first.trackingNumber })
        .select("_id")
        .lean();
      return order ? String(order._id) : null;
    },
  );
};

export { handleShippingWebhook };
