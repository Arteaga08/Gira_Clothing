import { OrderStatus } from "../enums/orderStatus.js";

/**
 * Spanish labels for OrderStatus, single source shared between the API's
 * error messages (apps/api/src/utils/orderTransitions.ts re-exports this) and
 * the admin dashboard, so the two can never drift apart.
 */
const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = Object.freeze({
  [OrderStatus.PENDING_PAYMENT]: "pendiente de pago",
  [OrderStatus.PAID]: "pagada",
  [OrderStatus.PROCESSING]: "en preparación",
  [OrderStatus.SHIPPED]: "enviada",
  [OrderStatus.DELIVERED]: "entregada",
  [OrderStatus.CANCELLED]: "cancelada",
  [OrderStatus.EXPIRED]: "expirada",
  [OrderStatus.REFUNDED]: "reembolsada",
  [OrderStatus.DISPUTED]: "en disputa",
});

export { ORDER_STATUS_LABELS };
