import type { AdminCoupon } from "./coupon.js";
import type { CustomerRankPeriod, CustomerRankSort } from "../constants/customer.js";

interface CustomerStats {
  /** Paid orders (REVENUE_STATUSES, no dispute lost). */
  orderCount: number;
  /** Net of refunds, in MXN centavos (USD orders converted with their own saved rate). */
  spentMxn: number;
  lastOrderAt: Date | null;
}

interface AdminCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  stats: CustomerStats;
}

interface TopCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  orderCount: number;
  spentMxn: number;
}

interface TopCustomers {
  period: CustomerRankPeriod;
  sortBy: CustomerRankSort;
  from: Date;
  to: Date;
  rows: TopCustomer[];
}

interface GiveCouponResult {
  coupon: AdminCoupon;
  /** false = the coupon exists but the email did not go out. */
  emailSent: boolean;
}

export type { CustomerStats, AdminCustomer, TopCustomer, TopCustomers, GiveCouponResult };
