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
  /** Coupon discount; 0 without one. Absent on payloads queued before M16. */
  discount?: number;
  couponCode?: string | undefined;
  shippingCost: number;
  total: number;
  lines: OrderEmailLine[];
}

interface RefundEmailSnapshot extends OrderEmailSnapshot {
  /** What went back to the card, in the order's currency. */
  refundedAmount: number;
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
/** The account's order list: where a pending order is paid again (no credential in the link). */
const myOrdersUrl = (): string => `${env.clientUrl}/cuenta/pedidos`;
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

const discountLine = (snapshot: OrderEmailSnapshot): string | null => {
  if (!snapshot.discount) return null;
  const label = snapshot.couponCode ? `Descuento (${snapshot.couponCode})` : "Descuento";
  return `${label}: -${formatMoney(snapshot.discount, snapshot.currency)}`;
};

const totalsHtml = (snapshot: OrderEmailSnapshot): string => {
  const discount = discountLine(snapshot);
  return (
    `<p>Subtotal: ${formatMoney(snapshot.subtotal, snapshot.currency)}<br>` +
    (discount ? `${escapeHtml(discount)}<br>` : "") +
    `Envío: ${formatMoney(snapshot.shippingCost, snapshot.currency)}<br>` +
    `<strong>Total: ${formatMoney(snapshot.total, snapshot.currency)}</strong></p>`
  );
};

const totalsText = (snapshot: OrderEmailSnapshot): string => {
  const discount = discountLine(snapshot);
  return (discount ? `${discount}\n` : "") + `Total: ${formatMoney(snapshot.total, snapshot.currency)}`;
};

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
    `${totalsText(snapshot)}\n\n` +
    `Ver mi pedido: ${orderUrl(snapshot.publicId)}`,
});

const renderOrderPreparing = (snapshot: OrderEmailSnapshot): RenderedMail => ({
  subject: `Tu pedido ${snapshot.orderNumber} está en proceso`,
  html: layout(
    `${snapshot.customerName}, ya estamos en eso`,
    `<p>Tu pedido está en proceso. Te mandamos el número de guía en cuanto salga del taller.</p>` +
      folioHtml(snapshot) +
      `<p><a href="${orderUrl(snapshot.publicId)}">Ver mi pedido</a></p>`,
  ),
  text:
    `${snapshot.customerName}, tu pedido está en proceso.\nFolio: ${snapshot.orderNumber}\n\n` +
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

// Never mentions a refund: a declined card took no money (ECOMMERCE guidelines, notifications).
const renderOrderPaymentFailed = (snapshot: OrderEmailSnapshot): RenderedMail => ({
  subject: `No pudimos cobrar tu pedido ${snapshot.orderNumber}`,
  html: layout(
    `${snapshot.customerName}, tu pago no pasó`,
    `<p>Tu banco no aprobó el cargo, así que no se te cobró nada. Tu pedido sigue apartado por un rato: ` +
      `puedes intentarlo otra vez con la misma tarjeta o con otra desde Mis pedidos.</p>` +
      folioHtml(snapshot) +
      `<p><a href="${myOrdersUrl()}">Ir a Mis pedidos</a></p>`,
  ),
  text:
    `${snapshot.customerName}, tu pago no pasó.\nFolio: ${snapshot.orderNumber}\n\n` +
    `Tu banco no aprobó el cargo, así que no se te cobró nada. Tu pedido sigue apartado por un rato: ` +
    `puedes intentarlo otra vez desde Mis pedidos.\n\nIr a Mis pedidos: ${myOrdersUrl()}`,
});

const renderOrderRefunded = (snapshot: RefundEmailSnapshot): RenderedMail => {
  const amount = formatMoney(snapshot.refundedAmount, snapshot.currency);
  return {
    subject: `Te devolvimos el pago de tu pedido ${snapshot.orderNumber}`,
    html: layout(
      `${snapshot.customerName}, ya te devolvimos tu dinero`,
      `<p>Reembolsamos <strong>${amount}</strong> a la tarjeta con la que pagaste. ` +
        `Según tu banco, puede tardar unos días en verse en tu estado de cuenta.</p>` +
        folioHtml(snapshot) +
        `<p><a href="${orderUrl(snapshot.publicId)}">Ver mi pedido</a></p>`,
    ),
    text:
      `${snapshot.customerName}, ya te devolvimos tu dinero.\nFolio: ${snapshot.orderNumber}\n\n` +
      `Reembolsamos ${amount} a la tarjeta con la que pagaste. ` +
      `Según tu banco, puede tardar unos días en verse en tu estado de cuenta.\n\n` +
      `Ver mi pedido: ${orderUrl(snapshot.publicId)}`,
  };
};

export type {
  OrderEmailSnapshot,
  ShippedEmailSnapshot,
  RefundEmailSnapshot,
  OrderEmailLine,
  RenderedMail,
};
export {
  formatMoney,
  renderOrderConfirmation,
  renderOrderPreparing,
  renderOrderShipped,
  renderOrderDelivered,
  renderOrderPaymentFailed,
  renderOrderRefunded,
};
