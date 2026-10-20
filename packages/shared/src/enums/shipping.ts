/** Which adapter produced a rate/label. Stored on the order so a label is never bought from a different provider than the one quoted. */
enum ShippingProviderName {
  STUB = "stub",
  ENVIA = "envia",
}

/**
 * Closed list of carriers the store sells. Anything else the provider returns
 * is dropped at the adapter. Adjust against GET /carrier?country_code=MX in the
 * Envía sandbox before going live.
 */
enum ShippingCarrier {
  ESTAFETA = "estafeta",
  FEDEX = "fedex",
  DHL = "dhl",
  PAQUETEXPRESS = "paquetexpress",
  REDPACK = "redpack",
  UPS = "ups",
}

/** Lifecycle of the purchased label, persisted on the order. */
enum ShippingLabelStatus {
  /** Queued: waiting for the first (or next) purchase attempt. */
  PENDING = "pending",
  /** A purchase attempt is in flight (lease). */
  REQUESTED = "requested",
  READY = "ready",
  /** A retryable failure; `nextAttemptAt` says when the job tries again. */
  FAILED = "failed",
  /** A human must look: retries exhausted, uncertain outcome, or bad setup. */
  NEEDS_REVIEW = "needs_review",
  CANCEL_PENDING = "cancel_pending",
  CANCELLED = "cancelled",
}

export { ShippingProviderName, ShippingCarrier, ShippingLabelStatus };
