import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { ShipmentTrackingStatus } from "@gira/shared";

/**
 * One carrier status change. Append-only history for the logistics card and for
 * support; `Order.tracking` is the derived "current" value. The unique
 * (provider, providerEventId) index is the idempotency guarantee: a webhook
 * redelivery and a polling run that sees the same fact insert only once.
 */
interface ShipmentTrackingEventAttrs {
  order: Types.ObjectId;
  provider: string;
  providerEventId: string;
  trackingNumber: string;
  status: ShipmentTrackingStatus;
  rawStatus: string;
  description?: string;
  location?: string;
  occurredAt: Date;
  createdAt: Date;
}

const shipmentTrackingEventSchema = new Schema<ShipmentTrackingEventAttrs>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    provider: { type: String, required: true },
    providerEventId: { type: String, required: true },
    trackingNumber: { type: String, required: true },
    status: { type: String, enum: Object.values(ShipmentTrackingStatus), required: true },
    rawStatus: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 500 },
    location: { type: String, maxlength: 200 },
    occurredAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

shipmentTrackingEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });
shipmentTrackingEventSchema.index({ order: 1, occurredAt: 1 });

const ShipmentTrackingEvent = model<ShipmentTrackingEventAttrs>(
  "ShipmentTrackingEvent",
  shipmentTrackingEventSchema,
);

type ShipmentTrackingEventDocument = HydratedDocument<ShipmentTrackingEventAttrs>;

export type { ShipmentTrackingEventAttrs, ShipmentTrackingEventDocument };
export { ShipmentTrackingEvent };
