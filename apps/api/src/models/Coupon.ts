import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import {
  CouponDiscountType,
  COUPON_AMOUNT_MAX,
  COUPON_CODE_MAX,
  COUPON_MIN_SUBTOTAL_MAX,
  COUPON_NAME_MAX,
  COUPON_PERCENT_MAX,
} from "@gira/shared";

/**
 * Campaign coupon. The discount itself is never trusted from the client: the
 * checkout resolves the coupon by code and computes the amount server-side.
 * Dates and the redemption cap are optional (null = none).
 */

interface CouponAttrs {
  code: string;
  name: string;
  discountType: CouponDiscountType;
  /** Whole percent, 1-100. Required when discountType is percent. */
  percentOff?: number;
  /** MXN centavos. Required when discountType is fixed. */
  amountOffMxn?: number;
  /** MXN centavos; 0 = no minimum. */
  minSubtotalMxn: number;
  startsAt: Date | null;
  endsAt: Date | null;
  /** null = unlimited. */
  maxRedemptions: number | null;
  redeemedCount: number;
  isActive: boolean;
}

type CouponModel = Model<CouponAttrs>;
type CouponDocument = HydratedDocument<CouponAttrs>;

const isInteger = { validator: Number.isInteger, message: "{PATH} must be an integer" };

const couponSchema = new Schema<CouponAttrs, CouponModel>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: COUPON_CODE_MAX,
    },
    name: { type: String, required: true, trim: true, maxlength: COUPON_NAME_MAX },
    discountType: { type: String, enum: Object.values(CouponDiscountType), required: true },
    percentOff: {
      type: Number,
      min: 1,
      max: COUPON_PERCENT_MAX,
      validate: isInteger,
      required: [
        function (this: CouponAttrs) {
          return this.discountType === CouponDiscountType.PERCENT;
        },
        "percentOff is required for a percent coupon",
      ],
    },
    amountOffMxn: {
      type: Number,
      min: 1,
      max: COUPON_AMOUNT_MAX,
      validate: isInteger,
      required: [
        function (this: CouponAttrs) {
          return this.discountType === CouponDiscountType.FIXED;
        },
        "amountOffMxn is required for a fixed coupon",
      ],
    },
    minSubtotalMxn: { type: Number, min: 0, max: COUPON_MIN_SUBTOTAL_MAX, default: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    maxRedemptions: { type: Number, min: 1, default: null },
    redeemedCount: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

couponSchema.index({ isActive: 1, endsAt: 1 });
couponSchema.index({ createdAt: -1 });

const Coupon = model<CouponAttrs, CouponModel>("Coupon", couponSchema);

export type { CouponAttrs, CouponDocument };
export { Coupon };
