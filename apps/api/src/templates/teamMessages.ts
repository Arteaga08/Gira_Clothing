import type { Currency } from "@gira/shared";
import { formatMoney } from "./orderEmails.js";
import type { TeamMessage } from "../adapters/notification/types.js";

/**
 * Operational pings. They carry the order's publicId (an internal-channel
 * identifier, not a public link) and never the customer's email or address:
 * a Telegram group is not a place to spill PII.
 */

interface TeamOrderSnapshot {
  publicId: string;
  total: number;
  currency: Currency;
  itemCount: number;
}

const renderTeamOrderPaid = (snapshot: TeamOrderSnapshot): TeamMessage => ({
  title: "🛍️ Nueva orden pagada",
  lines: [
    `Folio: ${snapshot.publicId}`,
    `Total: ${formatMoney(snapshot.total, snapshot.currency)}`,
    `Artículos: ${String(snapshot.itemCount)}`,
  ],
});

const renderTeamPaymentFailed = (publicId: string, reason?: string): TeamMessage => ({
  title: "⚠️ Pago rechazado",
  lines: [`Folio: ${publicId}`, ...(reason ? [`Motivo: ${reason}`] : [])],
});

/**
 * The one ping that means "money and inventory disagree, decide now". `reason`
 * is a short internal code (never provider text), so this message stays free of
 * anything a customer typed.
 */
const REVIEW_REASONS: Readonly<Record<string, string>> = Object.freeze({
  payment_after_expiry: "Se cobró un pedido que ya había expirado. Revisa si hay stock para surtirlo o reembolsa.",
  stock_commit_missed: "El pedido quedó pagado pero su apartado ya se había liberado: el stock NO se descontó.",
});

const renderTeamPaymentNeedsReview = (publicId: string, reason: string): TeamMessage => ({
  title: "🚨 Pedido pagado que necesita revisión",
  lines: [
    `Folio: ${publicId}`,
    REVIEW_REASONS[reason] ?? `Motivo: ${reason}`,
  ],
});

const renderTeamShipmentIncident = (
  publicId: string,
  status: string,
  carrier: string,
): TeamMessage => ({
  title: "📦 Incidencia de envío",
  lines: [`Folio: ${publicId}`, `Estado: ${status}`, `Paquetería: ${carrier}`],
});

export type { TeamOrderSnapshot };
export {
  renderTeamOrderPaid,
  renderTeamPaymentFailed,
  renderTeamPaymentNeedsReview,
  renderTeamShipmentIncident,
};
