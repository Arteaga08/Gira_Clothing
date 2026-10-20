import { AuditAction } from "@gira/shared";

/**
 * Spanish labels for the audit actions that can appear on an order. Partial on
 * purpose: the API may add actions before the panel learns them, and an
 * untranslated one is shown as-is rather than hidden (an operator should see
 * that something happened).
 */
const ACTIVITY_LABELS: Partial<Record<string, string>> = {
  [AuditAction.ORDER_CREATED]: "Pedido creado",
  [AuditAction.ORDER_STATUS_CHANGED]: "Estado actualizado",
  [AuditAction.ORDER_EXPIRED]: "Pedido expirado",
  [AuditAction.ORDER_REFUND_REQUESTED]: "Reembolso solicitado",
  [AuditAction.ORDER_PRIORITY_UPDATED]: "Prioridad actualizada",
  [AuditAction.ORDER_SHIPPING_ADDRESS_UPDATED]: "Dirección corregida",
  [AuditAction.ORDER_MARKED_SHIPPED]: "Marcado como enviado",
  [AuditAction.PAYMENT_INTENT_CREATED]: "Cobro iniciado",
  [AuditAction.PAYMENT_SUCCEEDED]: "Pago confirmado",
  [AuditAction.PAYMENT_FAILED]: "Pago fallido",
  [AuditAction.PAYMENT_CANCELLED]: "Cobro cancelado",
  [AuditAction.PAYMENT_REFUNDED]: "Pago reembolsado",
  [AuditAction.PAYMENT_PARTIALLY_REFUNDED]: "Reembolso parcial",
  [AuditAction.PAYMENT_DISPUTED]: "Disputa de pago abierta",
  [AuditAction.PAYMENT_DISPUTE_CLOSED]: "Disputa de pago cerrada",
  [AuditAction.PAYMENT_AFTER_EXPIRY]: "Pago recibido tras expirar",
  [AuditAction.STOCK_RESERVED]: "Stock reservado",
  [AuditAction.STOCK_RESERVATION_COMMITTED]: "Stock descontado",
  [AuditAction.STOCK_RESERVATION_RELEASED]: "Reserva de stock liberada",
  [AuditAction.STOCK_RESTOCKED_ON_REFUND]: "Stock devuelto por el reembolso",
  [AuditAction.STOCK_COMMIT_FAILED]: "Falló el descuento de stock",
  [AuditAction.STOCK_COMMIT_MISSED]: "Pagado sin stock descontado",
  [AuditAction.REFUND_WITHOUT_RESTOCK]: "Reembolso sin devolver stock",
  [AuditAction.PAYMENT_CANCEL_FAILED]: "No se pudo cancelar el cobro",
  [AuditAction.LABEL_REQUESTED]: "Guía solicitada",
  [AuditAction.LABEL_CREATED]: "Guía generada",
  [AuditAction.LABEL_FAILED]: "Falló la guía",
  [AuditAction.LABEL_NEEDS_REVIEW]: "Guía por revisar",
  [AuditAction.LABEL_RETRY_REQUESTED]: "Reintento de guía solicitado",
  [AuditAction.LABEL_CANCEL_REQUESTED]: "Cancelación de guía solicitada",
  [AuditAction.LABEL_CANCELLED]: "Guía cancelada",
  [AuditAction.TRACKING_UPDATED]: "Rastreo actualizado",
  [AuditAction.TRACKING_TRANSITION_BLOCKED]: "Rastreo detenido por una disputa",
};

const activityLabel = (action: string): string => ACTIVITY_LABELS[action] ?? action;

/** The actor id is internal: the panel says who KIND of actor it was, never the id. */
const activityActorLabel = (entry: { actorType: "user" | "system"; actorId?: string | undefined }): string =>
  entry.actorType === "system" ? "Sistema" : "Equipo";

export { activityLabel, activityActorLabel };
