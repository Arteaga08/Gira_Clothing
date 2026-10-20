import { Currency } from "@gira/shared";
import { env } from "../config/env.js";
import { escapeHtml, layout, type RenderedMail } from "./emailLayout.js";

/**
 * Pure render functions. They take a FLAT SNAPSHOT — never a Mongoose document
 * — so a template can never trigger a query, and the outbox can store exactly
 * what it will render. Copy is Spanish (customer-facing); code is English
 * (non-negociable #3).
 *
 * Every interpolated value goes through escapeHtml. The customer name and the
 * address reach us through the API, and sanitizeInput escapes them on the way
 * in, but an email built by string concatenation must not depend on that: two
 * layers, neither replacing the other.
 */

interface OrderEmailLine {
  productName: string;
  printName: string;
  qty: number;
  lineTotal: number;
}

interface OrderEmailSnapshot {
  /** The credential: used ONLY to build the link to the order page. */
  publicId: string;
  /** The folio the customer reads and quotes. */
  orderNumber: string;
  customerName: string;
  currency: Currency;
  subtotal: number;
  shippingCost: number;
  total: number;
  lines: OrderEmailLine[];
}

interface ShippedEmailSnapshot extends OrderEmailSnapshot {
  /** Display name ("Estafeta"), resolved at enqueue time. */
  carrierName: string;
  trackingNumber: string;
  /** The carrier's own tracking page; absent if the provider gave none. */
  trackUrl?: string | undefined;
}

const MINOR_UNITS = 100;

/** Minor units -> "$1,350.00 MXN". Integer math only; no float ever touches a price. */
const formatMoney = (minorUnits: number, currency: Currency): string => {
  const units = Math.trunc(minorUnits / MINOR_UNITS);
  const cents = String(Math.abs(minorUnits % MINOR_UNITS)).padStart(2, "0");
  const grouped = units.toLocaleString("en-US");
  return `$${grouped}.${cents} ${currency}`;
};

const orderUrl = (publicId: string): string => `${env.clientUrl}/orden/${publicId}`;
const trackingUrl = (publicId: string): string => `${orderUrl(publicId)}/seguimiento`;

const folioHtml = (snapshot: OrderEmailSnapshot): string =>
  `<p>Folio: <strong>${escapeHtml(snapshot.orderNumber)}</strong></p>`;

const renderLinesHtml = (lines: OrderEmailLine[], currency: Currency): string =>
  lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.productName)} · ${escapeHtml(line.printName)}</td>` +
        `<td align="right">${String(line.qty)}</td>` +
        `<td align="right">${formatMoney(line.lineTotal, currency)}</td></tr>`,
    )
    .join("");

const renderLinesText = (lines: OrderEmailLine[], currency: Currency): string =>
  lines
    .map(
      (line) =>
        `- ${line.productName} · ${line.printName} x${String(line.qty)} — ` +
        formatMoney(line.lineTotal, currency),
    )
    .join("\n");

const totalsHtml = (snapshot: OrderEmailSnapshot): string =>
  `<p>Subtotal: ${formatMoney(snapshot.subtotal, snapshot.currency)}<br>` +
  `Envío: ${formatMoney(snapshot.shippingCost, snapshot.currency)}<br>` +
  `<strong>Total: ${formatMoney(snapshot.total, snapshot.currency)}</strong></p>`;

const renderOrderConfirmation = (snapshot: OrderEmailSnapshot): RenderedMail => ({
  subject: `Confirmamos tu compra ${snapshot.orderNumber} en Gira Clothing`,
  html: layout(
    `¡Gracias por tu compra, ${snapshot.customerName}!`,
    `<p>Ya recibimos tu pago. Te avisamos en cuanto empecemos a preparar tu pedido.</p>` +
      folioHtml(snapshot) +
      `<table width="100%">${renderLinesHtml(snapshot.lines, snapshot.currency)}</table>` +
      totalsHtml(snapshot) +
      `<p><a href="${orderUrl(snapshot.publicId)}">Ver mi pedido</a></p>`,
  ),
  text:
    `¡Gracias por tu compra, ${snapshot.customerName}!\n\n` +
    `Ya recibimos tu pago.\nFolio: ${snapshot.orderNumber}\n\n${renderLinesText(snapshot.lines, snapshot.currency)}\n\n` +
    `Total: ${formatMoney(snapshot.total, snapshot.currency)}\n\n` +
    `Ver mi pedido: ${orderUrl(snapshot.publicId)}`,
});

const renderOrderPreparing = (snapshot: OrderEmailSnapshot): RenderedMail => ({
  subject: `Estamos preparando tu pedido ${snapshot.orderNumber}`,
  html: layout(
    `${snapshot.customerName}, ya estamos en eso`,
    `<p>Tu pedido está en preparación. Te mandamos el número de guía en cuanto salga del taller.</p>` +
      folioHtml(snapshot) +
      `<p><a href="${orderUrl(snapshot.publicId)}">Ver mi pedido</a></p>`,
  ),
  text:
    `${snapshot.customerName}, ya estamos preparando tu pedido.\nFolio: ${snapshot.orderNumber}\n\n` +
    `Te mandamos el número de guía en cuanto salga del taller.\n\n` +
    `Ver mi pedido: ${orderUrl(snapshot.publicId)}`,
});

const parcelHtml = (s: ShippedEmailSnapshot): string =>
  `<p>Paquetería: <strong>${escapeHtml(s.carrierName)}</strong><br>` +
  `Número de guía: <strong>${escapeHtml(s.trackingNumber)}</strong></p>` +
  (s.trackUrl ? `<p><a href="${escapeHtml(s.trackUrl)}">Rastrear con la paquetería</a></p>` : "");

const parcelText = (s: ShippedEmailSnapshot): string =>
  `Paquetería: ${s.carrierName}\nNúmero de guía: ${s.trackingNumber}` +
  (s.trackUrl ? `\nRastrear con la paquetería: ${s.trackUrl}` : "");

const renderOrderShipped = (snapshot: ShippedEmailSnapshot): RenderedMail => ({
  subject: `Tu pedido ${snapshot.orderNumber} va en camino`,
  html: layout(
    `${snapshot.customerName}, tu pedido ya salió`,
    folioHtml(snapshot) +
      parcelHtml(snapshot) +
      `<p><a href="${trackingUrl(snapshot.publicId)}">Seguir mi envío</a></p>`,
  ),
  text:
    `${snapshot.customerName}, tu pedido ya salió.\nFolio: ${snapshot.orderNumber}\n\n` +
    `${parcelText(snapshot)}\n\nSeguir mi envío: ${trackingUrl(snapshot.publicId)}`,
});

const renderOrderDelivered = (snapshot: ShippedEmailSnapshot): RenderedMail => ({
  subject: `Tu pedido ${snapshot.orderNumber} llegó`,
  html: layout(
    `${snapshot.customerName}, ¡tu pedido llegó!`,
    `<p>La paquetería marcó tu pedido como entregado. Esperamos que lo disfrutes.</p>` +
      folioHtml(snapshot) +
      parcelHtml(snapshot) +
      `<p><a href="${orderUrl(snapshot.publicId)}">Ver mi pedido</a></p>`,
  ),
  text:
    `${snapshot.customerName}, ¡tu pedido llegó!\nFolio: ${snapshot.orderNumber}\n\n` +
    `${parcelText(snapshot)}\n\nVer mi pedido: ${orderUrl(snapshot.publicId)}`,
});

export type { OrderEmailSnapshot, ShippedEmailSnapshot, OrderEmailLine, RenderedMail };
export {
  formatMoney,
  renderOrderConfirmation,
  renderOrderPreparing,
  renderOrderShipped,
  renderOrderDelivered,
};
