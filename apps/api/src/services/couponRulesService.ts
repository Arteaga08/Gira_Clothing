import type { Types } from "mongoose";
import { Coupon, type CouponDocument } from "../models/Coupon.js";
import { CouponRedemption } from "../models/CouponRedemption.js";
import { AppError } from "../utils/AppError.js";

const MSG = {
  GUEST: "Inicia sesión para usar un cupón.",
  INVALID: "El cupón no es válido.",
  EXPIRED: "El cupón ya venció.",
  EXHAUSTED: "El cupón ya alcanzó su límite de usos.",
  USED: "Ya usaste este cupón.",
} as const;

const formatMxn = (cents: number): string =>
  `$${(cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Read-only eligibility. Missing, retired and not-yet-started coupons share one
 * message so nobody can probe which codes exist. The atomic guard is
 * claimCoupon; this only gives the customer a precise reason before stock is held.
 */
const resolveCouponForCheckout = async (
  rawCode: string,
  userId: Types.ObjectId | undefined,
  now: Date = new Date(),
): Promise<CouponDocument> => {
  if (!userId) throw new AppError(MSG.GUEST, 401);

  const coupon = await Coupon.findOne({ code: rawCode.trim().toUpperCase() });
  if (!coupon || !coupon.isActive || (coupon.startsAt && coupon.startsAt > now)) {
    throw new AppError(MSG.INVALID, 400);
  }
  if (coupon.endsAt && coupon.endsAt < now) throw new AppError(MSG.EXPIRED, 409);
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    throw new AppError(MSG.EXHAUSTED, 409);
  }
  if (await CouponRedemption.exists({ coupon: coupon._id, user: userId })) {
    throw new AppError(MSG.USED, 409);
  }
  return coupon;
};

/** The minimum is checked on the MXN subtotal, whatever currency is charged. */
const assertMeetsMinimum = (coupon: { minSubtotalMxn: number }, subtotalMxn: number): void => {
  if (coupon.minSubtotalMxn > 0 && subtotalMxn < coupon.minSubtotalMxn) {
    throw new AppError(
      `Agrega ${formatMxn(coupon.minSubtotalMxn - subtotalMxn)} más para usar este cupón.`,
      409,
    );
  }
};

export { resolveCouponForCheckout, assertMeetsMinimum };
