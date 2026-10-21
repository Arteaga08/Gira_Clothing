enum CouponDiscountType {
  PERCENT = "percent",
  FIXED = "fixed",
}

/** Campaign = for any customer with an account; personal = bound to one customer (`assignedUser`). */
enum CouponKind {
  CAMPAIGN = "campaign",
  PERSONAL = "personal",
}

/** Computed by the server from isActive, dates and counters; never stored. */
enum CouponStatus {
  ACTIVE = "active",
  SCHEDULED = "scheduled",
  EXPIRED = "expired",
  EXHAUSTED = "exhausted",
  RETIRED = "retired",
}

export { CouponDiscountType, CouponKind, CouponStatus };
