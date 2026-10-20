import { OrderStatus, ShippingLabelStatus } from "@gira/shared";
import { Order } from "../models/Order.js";
import { getShippingProvider } from "../adapters/shipping/index.js";
import { applyTrackingEvents } from "../services/shipmentTrackingService.js";
import { logger } from "../config/logger.js";

/**
 * Safety net for the carrier webhook (missing secret, dropped deliveries):
 * every ~30 min asks the provider about parcels still in flight. Same service
 * as the webhook, so the two can never disagree. Events carry no delivery id
 * here: the service derives a stable one, so repeated runs insert once.
 */

const SYNC_EVERY_MS = 30 * 60 * 1000;
const MAX_PARCEL_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH = 200;
const TRACKABLE = [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED];

const reconcileTracking = async (): Promise<void> => {
  const now = Date.now();
  const due = await Order.find({
    status: { $in: TRACKABLE },
    "label.status": ShippingLabelStatus.READY,
    "label.trackingNumber": { $exists: true },
    "label.readyAt": { $gte: new Date(now - MAX_PARCEL_AGE_MS) },
    $or: [
      { "tracking.lastSyncedAt": { $exists: false } },
      { "tracking.lastSyncedAt": { $lt: new Date(now - SYNC_EVERY_MS) } },
    ],
  })
    .sort({ "tracking.lastSyncedAt": 1, createdAt: 1 })
    .limit(BATCH)
    .select("_id label.trackingNumber tracking")
    .lean();
  if (due.length === 0) return;

  const provider = getShippingProvider();
  const numbers = due.map((o) => o.label!.trackingNumber!);

  let events;
  try {
    events = await provider.getTracking(numbers, {});
  } catch (err) {
    logger.error({ err }, "No se pudo consultar el rastreo; se reintenta en la próxima corrida");
    return;
  }

  // Per parcel, so one poison event cannot abort the batch. A failed parcel is not
  // marked as synced and is retried on the next run.
  const byNumber = new Map<string, typeof events>();
  for (const event of events) {
    const list = byNumber.get(event.trackingNumber) ?? [];
    list.push(event);
    byNumber.set(event.trackingNumber, list);
  }
  const failed = new Set<string>();
  for (const [trackingNumber, group] of byNumber) {
    try {
      await applyTrackingEvents(provider.name, group);
    } catch (err) {
      failed.add(trackingNumber);
      logger.error(
        { err, trackingNumber },
        "No se pudo aplicar el rastreo de una guía; se reintenta",
      );
    }
  }
  const syncedIds = due.filter((o) => !failed.has(o.label!.trackingNumber!)).map((o) => o._id);
  if (syncedIds.length === 0) return;

  // Only parcels actually asked about (and applied) are marked as synced. Pipeline update:
  // keeps an existing tracking.status, otherwise seeds "label_created" (the
  // schema requires `status` inside `tracking`). Bypasses Mongoose validators;
  // safe because the value comes from our own enum.
  await Order.updateMany({ _id: { $in: syncedIds } }, [
    {
      $set: {
        "tracking.lastSyncedAt": new Date(),
        "tracking.status": { $ifNull: ["$tracking.status", "label_created"] },
      },
    },
  ]);
};

export { reconcileTracking };
