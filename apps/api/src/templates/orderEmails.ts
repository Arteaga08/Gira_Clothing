import { Currency } from "@gira/shared";
import { env } from "../config/env.js";

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
  publicId: string;
  customerName: string;
  currency: Currency;
  subtotal: number;
  shippingCost: number;
  total: number;
  lines: OrderEmailLine[];
}

interface ShippedEmailSnapshot extends OrderEmailSnapshot {
  carrier: string;
  trackingNumber: string;
}

interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const MINOR_UNITS = 100;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Minor units -> "$1,350.00 MXN". Integer math only; no float ever touches a price. */
const formatMoney = (minorUnits: number, currency: Currency): string => {
  const units = Math.trunc(minorUnits / MINOR_UNITS);
  const cents = String(Math.abs(minorUnits % MINOR_UNITS)).padStart(2, "0");
  const grouped = units.toLocaleString("en-US");
  return `$${grouped}.${cents} ${currency}`;
};

const orderUrl = (publicId: string): string => `${env.clientUrl}/orden/${publicId}`;
const trackingUrl = (publicId: string): string => `${orderUrl(publicId)}/seguimiento`;

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

const layout = (heading: string, bodyHtml: string): string =>
  `<!doctype html><html lang="es"><body style="font-family:system-ui,sans-serif;color:#1a1a1a">` +
  `<h1 style="font-size:20px">${escapeHtml(heading)}</h1>${bodyHtml}` +
  `<p style="font-size:12px;color:#666">Gira Clothing</p></body></html>`;

const totalsHtml = (snapshot: OrderEmailSnapshot): string =>
  `<p>Subtotal: ${formatMoney(snapshot.subtotal, snapshot.currency)}<br>` +
  `Envío: ${formatMoney(snapshot.shippingCost, snapshot.currency)}<br>` +
  `<strong>Total: ${formatMoney(snapshot.total, snapshot.currency)}</strong></p>`;

const renderOrderConfirmation = (snapshot: OrderEmailSnapshot): RenderedMail => ({
  subject: "Confirmamos tu compra en Gira Clothing",
  html: layout(
    `¡Gracias por tu compra, ${snapshot.customerName}!`,
    `<p>Ya recibimos tu pago. Te avisamos en cuanto empecemos a preparar tu pedido.</p>` +
      `<table width="100%">${renderLinesHtml(snapshot.lines, snapshot.currency)}</table>` +
      totalsHtml(snapshot) +
      `<p><a href="${orderUrl(snapshot.publicId)}">Ver mi pedido</a></p>`,
  ),
  text:
    `¡Gracias por tu compra, ${snapshot.customerName}!\n\n` +
    `Ya recibimos tu pago.\n\n${renderLinesText(snapshot.lines, snapshot.currency)}\n\n` +
    `Total: ${formatMoney(snapshot.total, snapshot.currency)}\n\n` +
    `Ver mi pedido: ${orderUrl(snapshot.publicId)}`,
});

const renderOrderPreparing = (snapshot: OrderEmailSnapshot): RenderedMail => ({
  subject: "Estamos preparando tu pedido",
  html: layout(
    `${snapshot.customerName}, ya estamos en eso`,
    `<p>Tu pedido está en preparación. Te mandamos el número de guía en cuanto salga del taller.</p>` +
      `<p><a href="${orderUrl(snapshot.publicId)}">Ver mi pedido</a></p>`,
  ),
  text:
    `${snapshot.customerName}, ya estamos preparando tu pedido.\n\n` +
    `Te mandamos el número de guía en cuanto salga del taller.\n\n` +
    `Ver mi pedido: ${orderUrl(snapshot.publicId)}`,
});

const renderOrderShipped = (snapshot: ShippedEmailSnapshot): RenderedMail => ({
  subject: "Tu pedido va en camino",
  html: layout(
    `${snapshot.customerName}, tu pedido ya salió`,
    `<p>Paquetería: <strong>${escapeHtml(snapshot.carrier)}</strong><br>` +
      `Número de guía: <strong>${escapeHtml(snapshot.trackingNumber)}</strong></p>` +
      `<p><a href="${trackingUrl(snapshot.publicId)}">Seguir mi envío</a></p>`,
  ),
  text:
    `${snapshot.customerName}, tu pedido ya salió.\n\n` +
    `Paquetería: ${snapshot.carrier}\nNúmero de guía: ${snapshot.trackingNumber}\n\n` +
    `Seguir mi envío: ${trackingUrl(snapshot.publicId)}`,
});

export type { OrderEmailSnapshot, ShippedEmailSnapshot, OrderEmailLine, RenderedMail };
export { formatMoney, renderOrderConfirmation, renderOrderPreparing, renderOrderShipped };
