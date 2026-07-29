import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { ReservationStatus } from "@gira/shared";

/**
 * Stock held for one in-flight order. ONE document per order (unique index).
 *
 * READ THIS BEFORE TOUCHING THE INDEXES — the two date fields are not
 * interchangeable:
 *
 *   expiresAt : when the hold is due. Swept by the CRON job, which performs the
 *               REAL release (atomic active->released flip + $inc reserved:-qty).
 *               It has NO TTL index, on purpose.
 *   purgeAt   : when this now-useless document may be deleted. Set ONLY when the
 *               reservation reaches a terminal state. This one carries the TTL
 *               index.
 *
 * A TTL index DELETES documents; it cannot decrement Variant.reserved. Putting
 * it on expiresAt would erase active holds and strand those units forever, with
 * no record of whom to return them to. The TTL index must never see an active
 * reservation.
 */

const PURGE_AFTER_DAYS = 30;

interface ReservationLine {
  variant: Types.ObjectId;
  qty: number;
}

interface StockReservationAttrs {
  order: Types.ObjectId;
  lines: ReservationLine[];
  status: ReservationStatus;
  expiresAt: Date;
  purgeAt: Date | null;
  releasedReason?: string;
}

type StockReservationModel = Model<StockReservationAttrs>;
type StockReservationDocument = HydratedDocument<StockReservationAttrs>;

const reservationLineSchema = new Schema<ReservationLine>(
  {
    variant: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const stockReservationSchema = new Schema<StockReservationAttrs, StockReservationModel>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    lines: { type: [reservationLineSchema], required: true },
    status: {
      type: String,
      enum: Object.values(ReservationStatus),
      default: ReservationStatus.ACTIVE,
    },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, default: null },
    releasedReason: { type: String },
  },
  { timestamps: true },
);

// The CRON sweep: active reservations past their due date.
stockReservationSchema.index({ status: 1, expiresAt: 1 });
// Garbage collection of terminal reservations only — purgeAt is null while active.
stockReservationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const StockReservation = model<StockReservationAttrs, StockReservationModel>(
  "StockReservation",
  stockReservationSchema,
);

export type { StockReservationAttrs, StockReservationDocument, ReservationLine };
export { StockReservation, PURGE_AFTER_DAYS };
