import { DisputeStatus, OrderStatus } from "../enums/orderStatus.js";
import { OrderPriority } from "../enums/orderPriority.js";
import type { OrderStatusGroup } from "../constants/orderStatusGroups.js";

/**
 * Spanish labels for OrderStatus, single source shared between the API's
 * error messages (apps/api/src/utils/orderTransitions.ts re-exports this) and
 * the admin dashboard, so the two can never drift apart.
 */
const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = Object.freeze({
  [OrderStatus.PENDING_PAYMENT]: "pago pendiente",
  [OrderStatus.PAID]: "pagado",
  [OrderStatus.PROCESSING]: "en proceso",
  [OrderStatus.SHIPPED]: "enviado",
  [OrderStatus.DELIVERED]: "recibido",
  [OrderStatus.CANCELLED]: "cancelado",
  [OrderStatus.EXPIRED]: "expirado",
  [OrderStatus.REFUNDED]: "reembolsado",
});

/** Spanish labels for DisputeStatus. Exhaustive Record: a new status breaks the typecheck. */
const DISPUTE_STATUS_LABELS: Readonly<Record<DisputeStatus, string>> = Object.freeze({
  [DisputeStatus.OPEN]: "abierta",
  [DisputeStatus.WON]: "ganada",
  [DisputeStatus.LOST]: "perdida",
  [DisputeStatus.WITHDRAWN]: "retirada",
});

/** Spanish labels for OrderPriority. */
const ORDER_PRIORITY_LABELS: Readonly<Record<OrderPriority, string>> = Object.freeze({
  [OrderPriority.NORMAL]: "normal",
  [OrderPriority.HIGH]: "alta",
  [OrderPriority.URGENT]: "urgente",
});

/** Spanish labels for the operator buckets of the orders panel. */
const ORDER_STATUS_GROUP_LABELS: Readonly<Record<OrderStatusGroup, string>> = Object.freeze({
  action: "Requieren acción",
  waiting: "Esperando pago",
  shipping: "En camino",
  problems: "Problemas",
});

export {
  ORDER_STATUS_LABELS,
  DISPUTE_STATUS_LABELS,
  ORDER_PRIORITY_LABELS,
  ORDER_STATUS_GROUP_LABELS,
};
