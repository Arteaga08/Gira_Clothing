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

const renderTeamShipmentIncident = (
  publicId: string,
  status: string,
  carrier: string,
): TeamMessage => ({
  title: "📦 Incidencia de envío",
  lines: [`Folio: ${publicId}`, `Estado: ${status}`, `Paquetería: ${carrier}`],
});

export type { TeamOrderSnapshot };
export { renderTeamOrderPaid, renderTeamPaymentFailed, renderTeamShipmentIncident };
