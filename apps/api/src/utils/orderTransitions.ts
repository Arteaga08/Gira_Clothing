import { OrderStatus, ORDER_STATUS_LABELS as LABELS } from "@gira/shared";
import { AppError } from "./AppError.js";

/**
 * The single source of truth for the order lifecycle. Every status change —
 * from the webhook, from a job, or from the admin panel — goes through here.
 * A status written directly to the model bypasses this file and is a bug.
 *
 * Two layers, deliberately:
 *  - `assertTransition` answers "is this move legal at all?"
 *  - `assertAdminTransition` answers "may a HUMAN make this move?" — narrower.
 *    Payment-driven states (paid, refunded, expired) are owned by the
 *    webhook and the reconciliation job. An admin who could type "paid" could
 *    ship unpaid goods, and the audit trail would show it as a legitimate move.
 */

const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.EXPIRED],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.REFUNDED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.REFUNDED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.REFUNDED],
  [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.EXPIRED]: [],
  [OrderStatus.REFUNDED]: [],
});

/** Moves a human admin may type into the status form. */
const ADMIN_ALLOWED: ReadonlySet<string> = new Set([
  `${OrderStatus.PAID}->${OrderStatus.PROCESSING}`,
  `${OrderStatus.PENDING_PAYMENT}->${OrderStatus.CANCELLED}`,
]);

/**
 * Moves that belong to the shipment flow: capturing the guide ships the order,
 * marking the parcel delivered delivers it. Typing them into the status form
 * would ship an order with no guide and no tracking email.
 */
const SHIPMENT_ALLOWED: ReadonlySet<string> = new Set([
  `${OrderStatus.PROCESSING}->${OrderStatus.SHIPPED}`,
  `${OrderStatus.SHIPPED}->${OrderStatus.DELIVERED}`,
]);

const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  TRANSITIONS[from].includes(to);

const assertTransition = (from: OrderStatus, to: OrderStatus): void => {
  if (!canTransition(from, to)) {
    throw new AppError(`No se puede pasar una orden de "${LABELS[from]}" a "${LABELS[to]}".`, 409);
  }
};

const assertAdminTransition = (from: OrderStatus, to: OrderStatus): void => {
  assertTransition(from, to);
  if (SHIPMENT_ALLOWED.has(`${from}->${to}`)) {
    throw new AppError(
      "Este estado se marca desde el envío (captura de guía / entrega), no manualmente.",
      403,
    );
  }
  if (!ADMIN_ALLOWED.has(`${from}->${to}`)) {
    throw new AppError(
      `El estado "${LABELS[to]}" lo determina el proveedor de pago, no se asigna manualmente.`,
      403,
    );
  }
};

/** The gate the shipment flow goes through; every other legal move is not its to make. */
const assertShipmentDrivenTransition = (from: OrderStatus, to: OrderStatus): void => {
  assertTransition(from, to);
  if (!SHIPMENT_ALLOWED.has(`${from}->${to}`)) {
    throw new AppError(`El estado "${LABELS[to]}" no se asigna desde el envío.`, 403);
  }
};

export {
  TRANSITIONS,
  LABELS,
  ADMIN_ALLOWED,
  SHIPMENT_ALLOWED,
  canTransition,
  assertTransition,
  assertAdminTransition,
  assertShipmentDrivenTransition,
};
