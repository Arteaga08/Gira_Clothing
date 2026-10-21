import mongoose, { type Types } from "mongoose";
import { Coupon } from "../models/Coupon.js";
import { CouponRedemption } from "../models/CouponRedemption.js";
import { AppError } from "../utils/AppError.js";
import { isDuplicateKeyError } from "../utils/mongoErrors.js";

interface ClaimInput {
  couponId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  /** In the order's currency, minor units. */
  discount: number;
}

/**
 * Atomic redemption: the guarded $inc and the redemption row commit together or
 * not at all. The guard stops two orders from taking the last seat; the unique
 * {coupon,user} index stops one customer from taking two.
 */
const claimCoupon = async (input: ClaimInput): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const claimed = await Coupon.findOneAndUpdate(
        {
          _id: input.couponId,
          isActive: true,
          $or: [{ maxRedemptions: null }, { $expr: { $lt: ["$redeemedCount", "$maxRedemptions"] } }],
        },
        { $inc: { redeemedCount: 1 } },
        { session, new: true },
      );
      if (!claimed) throw new AppError("El cupón ya alcanzó su límite de usos.", 409);
      await CouponRedemption.create(
        [{ coupon: input.couponId, user: input.userId, order: input.orderId, discount: input.discount }],
        { session },
      );
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError("Ya usaste este cupón.", 409);
    throw err;
  } finally {
    await session.endSession();
  }
};

/** Gives the seat back when the order never got paid. Idempotent: false = nothing to release. */
const releaseCouponForOrder = async (orderId: Types.ObjectId): Promise<boolean> => {
  const session = await mongoose.startSession();
  let released = false;
  try {
    await session.withTransaction(async () => {
      released = false;
      const redemption = await CouponRedemption.findOneAndDelete({ order: orderId }, { session });
      if (!redemption) return;
      await Coupon.updateOne({ _id: redemption.coupon }, { $inc: { redeemedCount: -1 } }, { session });
      released = true;
    });
  } finally {
    await session.endSession();
  }
  return released;
};

export type { ClaimInput };
export { claimCoupon, releaseCouponForOrder };
