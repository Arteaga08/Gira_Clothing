/** Triage only: never conditions a status transition, only where the order sorts in the queue. */
enum OrderPriority {
  NORMAL = "normal",
  HIGH = "alta",
  URGENT = "urgente",
}

export { OrderPriority };
