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
}

enum NotificationStatus {
  PENDING = "pending",
  /** Claimed by a dispatcher run. Reclaimed if the process died mid-send. */
  SENDING = "sending",
  SENT = "sent",
  /** Gave up after MAX_ATTEMPTS. Visible in the admin audit trail. */
  FAILED = "failed",
}

export { NotificationChannelKind, NotificationType, NotificationStatus };
