import { Schema, model, type Model, type Types } from "mongoose";

/**
 * One row per redeemed order. The unique indexes ARE the business rules:
 * a customer redeems a coupon once, and an order carries at most one redemption.
 * The row is deleted (not flagged) when an unpaid order releases its seat.
 */

interface CouponRedemptionAttrs {
  coupon: Types.ObjectId;
  user: Types.ObjectId;
  order: Types.ObjectId;
  /** Discount in the order's currency (minor units), for reports. */
  discount: number;
}

type CouponRedemptionModel = Model<CouponRedemptionAttrs>;

const couponRedemptionSchema = new Schema<CouponRedemptionAttrs, CouponRedemptionModel>(
  {
    coupon: { type: Schema.Types.ObjectId, ref: "Coupon", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    discount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

couponRedemptionSchema.index({ coupon: 1, user: 1 }, { unique: true });
couponRedemptionSchema.index({ order: 1 }, { unique: true });

const CouponRedemption = model<CouponRedemptionAttrs, CouponRedemptionModel>(
  "CouponRedemption",
  couponRedemptionSchema,
);

export type { CouponRedemptionAttrs };
export { CouponRedemption };
