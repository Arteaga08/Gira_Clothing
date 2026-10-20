/**
 * Outbox taxonomy. Nothing is sent inline: every message is queued as a
 * Notification document and dispatched by the background job, so a provider
 * outage costs a retry instead of a lost order confirmation.
 */

enum NotificationChannelKind {
  /** Transactional email to the customer (Resend). */
  EMAIL = "email",
  /** Operational ping to the Gira team (Telegram). */
  TEAM = "team",
}

enum NotificationType {
  ORDER_CONFIRMATION = "order_confirmation",
  ORDER_PREPARING = "order_preparing",
  ORDER_SHIPPED = "order_shipped",
  ORDER_DELIVERED = "order_delivered",
  TEAM_ORDER_PAID = "team_order_paid",
  TEAM_PAYMENT_FAILED = "team_payment_failed",
  TEAM_SHIPMENT_INCIDENT = "team_shipment_incident",
  /**
   * Money and inventory disagree and a human has to decide. Deliberately ONE
   * type for every such case: the partial unique index on (order, type) then
   * guarantees a single alert per order, however many times the webhook or the
   * reconciliation job re-runs.
   */
  TEAM_PAYMENT_NEEDS_REVIEW = "team_payment_needs_review",
  /**
   * A chargeback was lost. Its own type (not needs_review) because the outbox
   * allows ONE message per (order, type): sharing the slot would let this alert
   * swallow, or be swallowed by, an unrelated review on the same order.
   */
  TEAM_DISPUTE_LOST = "team_dispute_lost",
  /** The label could not be bought (retries exhausted, uncertain outcome or bad setup). One per order. */
  TEAM_SHIPPING_LABEL_FAILED = "team_shipping_label_failed",
  /** The provider refused to cancel a label of a refunded order. One per order. */
  TEAM_SHIPPING_LABEL_CANCEL_FAILED = "team_shipping_label_cancel_failed",
  /** A variant fell to or under the low-stock threshold. One per drop, re-armed on restock. */
  TEAM_STOCK_LOW = "team_stock_low",
  /** A variant ran out (available <= 0). One per drop, re-armed on restock. */
  TEAM_STOCK_OUT = "team_stock_out",
}

enum NotificationStatus {
  PENDING = "pending",
  /** Claimed by a dispatcher run. Reclaimed if the process died mid-send. */
  SENDING = "sending",
  SENT = "sent",
  /** Gave up after MAX_ATTEMPTS. Visible in the admin audit trail. */
  FAILED = "failed",
  /** Channel not configured (stub, dev/test only): nothing was delivered, so it is not `sent`. */
  SKIPPED = "skipped",
}

export { NotificationChannelKind, NotificationType, NotificationStatus };
