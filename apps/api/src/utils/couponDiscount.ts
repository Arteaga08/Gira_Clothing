import { CouponDiscountType, type Currency, type PriceRounding } from "@gira/shared";
import { convertFromMxn } from "./money.js";

interface DiscountableCoupon {
  discountType: CouponDiscountType;
  percentOff?: number | undefined;
  amountOffMxn?: number | undefined;
}

interface DiscountFx {
  mxnPerUsdCents: number;
  rounding: PriceRounding;
}

/**
 * Discount in the charge currency's minor units. Percent rounds DOWN (the shop
 * never gives a cent more than the label promises); fixed is stored in MXN and
 * converted like any other MXN amount. Capped at the subtotal: shipping is
 * never discounted and a total can't go negative.
 */
const computeCouponDiscount = (
  coupon: DiscountableCoupon,
  subtotal: number,
  currency: Currency,
  fx: DiscountFx,
): number => {
  const raw =
    coupon.discountType === CouponDiscountType.PERCENT
      ? Math.floor((subtotal * (coupon.percentOff ?? 0)) / 100)
      : convertFromMxn(coupon.amountOffMxn ?? 0, currency, fx.mxnPerUsdCents, fx.rounding);
  return Math.max(0, Math.min(subtotal, raw));
};

export type { DiscountableCoupon, DiscountFx };
export { computeCouponDiscount };
