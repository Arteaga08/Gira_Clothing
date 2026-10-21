enum CouponDiscountType {
  PERCENT = "percent",
  FIXED = "fixed",
}

/** Computed by the server from isActive, dates and counters; never stored. */
enum CouponStatus {
  ACTIVE = "active",
  SCHEDULED = "scheduled",
  EXPIRED = "expired",
  EXHAUSTED = "exhausted",
  RETIRED = "retired",
}

export { CouponDiscountType, CouponStatus };
