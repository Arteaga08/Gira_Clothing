import { OrderStatus } from "@gira/shared";
import { AppError } from "./AppError.js";

/**
 * The single source of truth for the order lifecycle. Every status change —
 * from the webhook, from a job, or from the admin panel — goes through here.
 * A status written directly to the model bypasses this file and is a bug.
 *
 * Two layers, deliberately:
 *  - `assertTransition` answers "is this move legal at all?"
 *  - `assertAdminTransition` answers "may a HUMAN make this move?" — narrower.
 *    Payment-driven states (paid, refunded, disputed, expired) are owned by the
 *    webhook and the reconciliation job. An admin who could type "paid" could
 *    ship unpaid goods, and the audit trail would show it as a legitimate move.
 */

const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.EXPIRED],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.REFUNDED, OrderStatus.DISPUTED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.REFUNDED, OrderStatus.DISPUTED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.REFUNDED, OrderStatus.DISPUTED],
  [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED, OrderStatus.DISPUTED],
  // A dispute closed in the merchant's favour returns the order to paid.
  [OrderStatus.DISPUTED]: [OrderStatus.PAID, OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.EXPIRED]: [],
  [OrderStatus.REFUNDED]: [],
});

/** Moves a human admin may perform. Everything else belongs to the payment flow. */
const ADMIN_ALLOWED: ReadonlySet<string> = new Set([
  `${OrderStatus.PAID}->${OrderStatus.PROCESSING}`,
  `${OrderStatus.PROCESSING}->${OrderStatus.SHIPPED}`,
  `${OrderStatus.SHIPPED}->${OrderStatus.DELIVERED}`,
  `${OrderStatus.PENDING_PAYMENT}->${OrderStatus.CANCELLED}`,
]);

const LABELS: Readonly<Record<OrderStatus, string>> = Object.freeze({
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

const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  TRANSITIONS[from].includes(to);

const assertTransition = (from: OrderStatus, to: OrderStatus): void => {
  if (!canTransition(from, to)) {
    throw new AppError(`No se puede pasar una orden de "${LABELS[from]}" a "${LABELS[to]}".`, 409);
  }
};

const assertAdminTransition = (from: OrderStatus, to: OrderStatus): void => {
  assertTransition(from, to);
  if (!ADMIN_ALLOWED.has(`${from}->${to}`)) {
    throw new AppError(
      `El estado "${LABELS[to]}" lo determina el proveedor de pago, no se asigna manualmente.`,
      403,
    );
  }
};

export { TRANSITIONS, LABELS, canTransition, assertTransition, assertAdminTransition };
