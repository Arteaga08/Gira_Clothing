/**
 * Order lifecycle. The valid transitions between these live in
 * apps/api/src/utils/orderTransitions.ts and are verified server-side on every
 * change — never a jump or a rollback without an explicit rule.
 *
 * There is deliberately NO "payment_failed" order status: Stripe lets a
 * customer retry a failed PaymentIntent with another card, so a failure is a
 * property of the payment, not the end of the order. The order stays in
 * PENDING_PAYMENT and PaymentStatus.FAILED records what happened.
 */
enum OrderStatus {
  PENDING_PAYMENT = "pending_payment",
  PAID = "paid",
  PROCESSING = "processing",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
  EXPIRED = "expired",
  REFUNDED = "refunded",
}

/** Provider-side payment state, tracked independently of the order lifecycle. */
enum PaymentStatus {
  REQUIRES_PAYMENT = "requires_payment",
  PROCESSING = "processing",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
}

/**
 * Chargeback lifecycle, in OUR vocabulary (the payment adapter translates the
 * provider's). It lives on the order as `disputeStatus` and is deliberately NOT
 * an OrderStatus: a dispute does not move the sale through fulfillment, and a
 * lost one is not a refund — the money left, the order was not reimbursed.
 */
enum DisputeStatus {
  OPEN = "open",
  WON = "won",
  LOST = "lost",
  WITHDRAWN = "withdrawn",
}

enum ReservationStatus {
  ACTIVE = "active",
  COMMITTED = "committed",
  RELEASED = "released",
}

export { OrderStatus, PaymentStatus, DisputeStatus, ReservationStatus };
