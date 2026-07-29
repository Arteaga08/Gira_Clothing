import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { ShipmentStatus } from "@gira/shared";

/**
 * The parcel for one order — a sub-resource with its own status enum and its own
 * timestamped event log (BACKEND_ARCHITECTURE_GUIDELINES, "Sub-recurso de estado
 * con historial rastreable").
 *
 * It lives in its own collection instead of inside Order for three reasons: the
 * order stays an immutable purchase snapshot, the event log grows without
 * bloating every order read, and the tracking number gets its own index (the
 * admin WILL search by it when a customer calls).
 *
 * Carrier and tracking number are captured BY HAND (spec decision: no carrier
 * API integration), so nothing here may assume a provider-shaped payload.
 */

interface ShipmentEvent {
  status: ShipmentStatus;
  at: Date;
  note?: string;
}

interface ShipmentAttrs {
  order: Types.ObjectId;
  /** Denormalized so public tracking resolves without loading the order. */
  orderPublicId: string;
  carrier: string;
  trackingNumber: string;
  /** Optional deep link to the carrier's own tracker. */
  trackingUrl?: string;
  status: ShipmentStatus;
  events: ShipmentEvent[];
  createdAt: Date;
  updatedAt: Date;
}

type ShipmentModel = Model<ShipmentAttrs>;
type ShipmentDocument = HydratedDocument<ShipmentAttrs>;

const shipmentEventSchema = new Schema<ShipmentEvent>(
  {
    status: { type: String, enum: Object.values(ShipmentStatus), required: true },
    at: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 200 },
  },
  { _id: false },
);

const shipmentSchema = new Schema<ShipmentAttrs, ShipmentModel>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderPublicId: { type: String, required: true },
    carrier: { type: String, required: true, trim: true, maxlength: 60 },
    trackingNumber: { type: String, required: true, trim: true, maxlength: 60 },
    trackingUrl: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: Object.values(ShipmentStatus),
      required: true,
      default: ShipmentStatus.IN_TRANSIT,
    },
    events: { type: [shipmentEventSchema], default: [] },
  },
  { timestamps: true },
);

// One parcel per order — the unique index IS the guard, not a pre-check.
shipmentSchema.index({ order: 1 }, { unique: true });
// Public tracking lookup by the order's capability id.
shipmentSchema.index({ orderPublicId: 1 }, { unique: true });
// "A customer is calling about guide 1234567890."
shipmentSchema.index({ trackingNumber: 1 });

const Shipment = model<ShipmentAttrs, ShipmentModel>("Shipment", shipmentSchema);

export type { ShipmentAttrs, ShipmentDocument, ShipmentEvent };
export { Shipment };
