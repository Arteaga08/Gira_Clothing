import { DisputeStatus, OrderStatus, ShippingLabelStatus } from "@gira/shared";

interface LogisticsInput {
  status: OrderStatus;
  disputeStatus?: DisputeStatus | undefined;
  label?: { status: ShippingLabelStatus; trackingNumber?: string | undefined } | undefined;
}

interface LogisticsState {
  /** Copy shown instead of the label details; null when the card shows the label. */
  emptyCopy: string | null;
  canPrepare: boolean;
  canShip: boolean;
  /** Why "Marcar enviado" is disabled; null when it is enabled or does not apply. */
  shipBlockedReason: string | null;
  canRetryLabel: boolean;
  /** An uncertain result may already have bought a label: retrying can buy a second one. */
  retryNeedsWarning: boolean;
}

const COPY_AWAITING_PAYMENT = "Disponible cuando se confirme el pago.";
const COPY_WILL_NOT_SHIP = "Este pedido no se enviará.";
const COPY_LABEL_AT_PAYMENT = "La guía se genera al confirmarse el pago.";
const REASON_PREPARE_FIRST = "Primero pásalo a en proceso.";
const REASON_LABEL_NOT_READY = "La guía todavía no está lista.";
const REASON_DISPUTE = "Hay una disputa de pago abierta o perdida.";

const CLOSED_STATUSES: readonly OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.REFUNDED];
const RETRYABLE_ORDER_STATUSES: readonly OrderStatus[] = [OrderStatus.PAID, OrderStatus.PROCESSING];
const RETRYABLE_LABEL_STATUSES: readonly ShippingLabelStatus[] = [
  ShippingLabelStatus.FAILED,
  ShippingLabelStatus.NEEDS_REVIEW,
];
const BLOCKING_DISPUTES: readonly DisputeStatus[] = [DisputeStatus.OPEN, DisputeStatus.LOST];

const emptyCopyOf = ({ status, label }: LogisticsInput): string | null => {
  if (CLOSED_STATUSES.includes(status)) return COPY_WILL_NOT_SHIP;
  if (status === OrderStatus.PENDING_PAYMENT && !label) return COPY_AWAITING_PAYMENT;
  if (status === OrderStatus.PAID && !label) return COPY_LABEL_AT_PAYMENT;
  return null;
};

const shipBlockedReasonOf = (input: LogisticsInput): string | null => {
  const { status, label, disputeStatus } = input;
  if (status === OrderStatus.PAID) return REASON_PREPARE_FIRST;
  if (status !== OrderStatus.PROCESSING) return null;
  const labelReady = label?.status === ShippingLabelStatus.READY && Boolean(label.trackingNumber);
  if (!labelReady) return REASON_LABEL_NOT_READY;
  if (disputeStatus && BLOCKING_DISPUTES.includes(disputeStatus)) return REASON_DISPUTE;
  return null;
};

const logisticsStateOf = (input: LogisticsInput): LogisticsState => {
  const { status, label } = input;
  const emptyCopy = emptyCopyOf(input);
  const shipBlockedReason = emptyCopy ? null : shipBlockedReasonOf(input);
  // The API never retries a label that already has a guide number (it would buy a second one), so neither do we.
  const canRetryLabel =
    RETRYABLE_ORDER_STATUSES.includes(status) &&
    label !== undefined &&
    RETRYABLE_LABEL_STATUSES.includes(label.status) &&
    !label.trackingNumber;

  return {
    emptyCopy,
    canPrepare: status === OrderStatus.PAID,
    canShip: status === OrderStatus.PROCESSING && !emptyCopy && shipBlockedReason === null,
    shipBlockedReason,
    canRetryLabel,
    retryNeedsWarning: canRetryLabel && label?.status === ShippingLabelStatus.NEEDS_REVIEW,
  };
};

export { logisticsStateOf };
export type { LogisticsInput, LogisticsState };
