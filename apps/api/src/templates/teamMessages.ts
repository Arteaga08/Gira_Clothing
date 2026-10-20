import type { Currency } from "@gira/shared";
import { formatMoney } from "./orderEmails.js";
import type { TeamMessage } from "../adapters/notification/types.js";

/**
 * Operational pings. They carry the order's human folio (`orderNumber`), never
 * its `publicId` (that one is the credential for the customer's order page and
 * must not sit in a shared chat) and never the customer's email or address:
 * a Telegram group is not a place to spill PII.
 */

interface TeamOrderSnapshot {
  orderNumber: string;
  total: number;
  currency: Currency;
  itemCount: number;
}

const renderTeamOrderPaid = (snapshot: TeamOrderSnapshot): TeamMessage => ({
  title: "🛍️ Nueva orden pagada",
  lines: [
    `Folio: ${snapshot.orderNumber}`,
    `Total: ${formatMoney(snapshot.total, snapshot.currency)}`,
    `Artículos: ${String(snapshot.itemCount)}`,
  ],
});

const renderTeamPaymentFailed = (orderNumber: string, reason?: string): TeamMessage => ({
  title: "⚠️ Pago rechazado",
  lines: [`Folio: ${orderNumber}`, ...(reason ? [`Motivo: ${reason}`] : [])],
});

/**
 * The one ping that means "money and inventory disagree, decide now". `reason`
 * is a short internal code (never provider text), so this message stays free of
 * anything a customer typed.
 */
const REVIEW_REASONS: Readonly<Record<string, string>> = Object.freeze({
  payment_after_expiry: "Se cobró un pedido que ya había expirado. Revisa si hay stock para surtirlo o reembolsa.",
  stock_commit_failed:
    "El pedido quedó pagado pero falló el descuento de stock. Se reintenta solo; si el aviso se repite, revisa el inventario.",
  payment_cancel_failed:
    "No se pudo cancelar el cobro de un pedido expirado: el cliente aún podría pagarlo. Cancela el intent en Stripe.",
  refund_without_committed_stock:
    "Se reembolsó un pedido cuyo stock nunca se descontó: no se repuso nada. Confirma el inventario.",
  stock_commit_missed: "El pedido quedó pagado pero su apartado ya se había liberado: el stock NO se descontó.",
});

const renderTeamPaymentNeedsReview = (orderNumber: string, reason: string): TeamMessage => ({
  title: "🚨 Pedido pagado que necesita revisión",
  lines: [
    `Folio: ${orderNumber}`,
    REVIEW_REASONS[reason] ?? `Motivo: ${reason}`,
  ],
});

const renderTeamDisputeLost = (orderNumber: string): TeamMessage => ({
  title: "⚖️ Disputa perdida",
  lines: [
    `Folio: ${orderNumber}`,
    "El banco resolvió a favor del cliente: el dinero salió, pero el pedido NO se reembolsó ni se repuso stock.",
  ],
});

const renderTeamShipmentIncident = (
  orderNumber: string,
  status: string,
  carrier: string,
): TeamMessage => ({
  title: "📦 Incidencia de envío",
  lines: [`Folio: ${orderNumber}`, `Estado: ${status}`, `Paquetería: ${carrier}`],
});

const renderTeamShippingLabelFailed = (orderNumber: string, reason: string): TeamMessage => ({
  title: "🏷️ No se pudo generar la guía",
  lines: [
    `Folio: ${orderNumber}`,
    `Motivo: ${reason}`,
    "Revisa el pedido en el panel y reintenta la guía.",
  ],
});

const renderTeamShippingLabelCancelFailed = (orderNumber: string): TeamMessage => ({
  title: "🏷️ No se pudo cancelar la guía",
  lines: [
    `Folio: ${orderNumber}`,
    "El pedido se reembolsó, pero Envía no dejó cancelar la guía. Cancélala desde el portal de Envía para recuperar el saldo.",
  ],
});

interface TeamStockSnapshot {
  sku: string;
  productName: string;
  printName: string;
  available: number;
  threshold: number;
}

const stockLines = (s: TeamStockSnapshot): string[] => [
  `Modelo: ${s.productName}`,
  `Print: ${s.printName}`,
  `SKU: ${s.sku}`,
  `Disponible: ${s.available}`,
];

const renderTeamStockOut = (snapshot: TeamStockSnapshot): TeamMessage => ({
  title: "🚫 Producto agotado",
  lines: [...stockLines(snapshot), "Repón existencias en el panel de Inventario."],
});

const renderTeamStockLow = (snapshot: TeamStockSnapshot): TeamMessage => ({
  title: "⚠️ Stock bajo",
  lines: [...stockLines(snapshot), `Umbral de aviso: ${snapshot.threshold}`],
});

export type { TeamOrderSnapshot, TeamStockSnapshot };
export {
  renderTeamOrderPaid,
  renderTeamPaymentFailed,
  renderTeamPaymentNeedsReview,
  renderTeamDisputeLost,
  renderTeamShipmentIncident,
  renderTeamShippingLabelFailed,
  renderTeamShippingLabelCancelFailed,
  renderTeamStockOut,
  renderTeamStockLow,
};
