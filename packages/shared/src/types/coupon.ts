import type { CouponDiscountType, CouponKind, CouponStatus } from "../enums/coupon.js";

interface AssignedCustomer {
  id: string;
  firstName: string;
  lastName: string;
}

interface AdminCoupon {
  id: string;
  code: string;
  name: string;
  kind: CouponKind;
  /** Present only on personal coupons. */
  assignedCustomer?: AssignedCustomer;
  discountType: CouponDiscountType;
  /** Whole percent, 1-100. Present when discountType is percent. */
  percentOff?: number;
  /** MXN centavos. Present when discountType is fixed. */
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
  createdAt: string;
  updatedAt: string;
}

/** Frozen on the order: what this customer got, whatever the campaign becomes later. */
interface OrderCoupon {
  code: string;
  discountType: CouponDiscountType;
  /** Percent (1-100) or MXN centavos, by discountType. */
  value: number;
}

export type { AdminCoupon, AssignedCustomer, OrderCoupon };
