import type { AdminCoupon, CouponDiscountType, CouponStatus, Wire } from "@gira/shared";

/**
 * A coupon as the table and the modal hold it. The admin DTO already is the
 * panel's shape; this is the one place that fixes it, so an API change shows up
 * here and not scattered through components.
 */
interface PanelCoupon {
  id: string;
  code: string;
  name: string;
  discountType: CouponDiscountType;
  percentOff?: number;
  amountOffMxn?: number;
  /** MXN centavos; 0 = no minimum. */
  minSubtotalMxn: number;
  startsAt?: string;
  endsAt?: string;
  /** Absent = unlimited. */
  maxRedemptions?: number;
  redeemedCount: number;
  isActive: boolean;
  status: CouponStatus;
  updatedAt: string;
}

const toPanelCoupon = (coupon: Wire<AdminCoupon>): PanelCoupon => ({
  id: coupon.id,
  code: coupon.code,
  name: coupon.name,
  discountType: coupon.discountType,
  ...(coupon.percentOff !== undefined ? { percentOff: coupon.percentOff } : {}),
  ...(coupon.amountOffMxn !== undefined ? { amountOffMxn: coupon.amountOffMxn } : {}),
  minSubtotalMxn: coupon.minSubtotalMxn,
  ...(coupon.startsAt ? { startsAt: coupon.startsAt } : {}),
  ...(coupon.endsAt ? { endsAt: coupon.endsAt } : {}),
  ...(coupon.maxRedemptions !== undefined ? { maxRedemptions: coupon.maxRedemptions } : {}),
  redeemedCount: coupon.redeemedCount,
  isActive: coupon.isActive,
  status: coupon.status,
  updatedAt: coupon.updatedAt,
});

export type { PanelCoupon };
export { toPanelCoupon };
