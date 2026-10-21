import { CouponStatus, CouponDiscountType } from "@gira/shared";
import { vi } from "vitest";
import type { PanelCoupon } from "@/lib/coupons/panelCoupon";

const COUPON_ID = "68f2ab12c3d4e5f6a7b8caa1";
const COUPON_2_ID = "68f2ab12c3d4e5f6a7b8caa2";

const makePanelCoupon = (overrides: Partial<PanelCoupon> = {}): PanelCoupon => ({
  id: COUPON_ID,
  code: "VERANO10",
  name: "Verano",
  discountType: CouponDiscountType.PERCENT,
  percentOff: 10,
  minSubtotalMxn: 0,
  redeemedCount: 0,
  isActive: true,
  status: CouponStatus.ACTIVE,
  updatedAt: "2026-10-20T10:00:00.000Z",
  ...overrides,
});

const makeCouponClientMock = () => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  retire: vi.fn(),
  reactivate: vi.fn(),
});

export { COUPON_ID, COUPON_2_ID, makePanelCoupon, makeCouponClientMock };
