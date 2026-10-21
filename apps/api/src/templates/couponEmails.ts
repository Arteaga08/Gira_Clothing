import { env } from "../config/env.js";
import { escapeHtml, layout, type RenderedMail } from "./emailLayout.js";

/**
 * Personal coupon email. `message` is the ONLY value here written by a human (the admin)
 * rather than composed by the code: it travels as plain text and is escaped explicitly
 * before it is placed in the HTML; line breaks become <br> AFTER escaping.
 */

interface CouponGiftInput {
  firstName: string;
  code: string;
  /** Ready to show: "15% de descuento" / "$150.00 de descuento". */
  discountLabel: string;
  /** "$800.00", already formatted. */
  minSubtotalLabel?: string;
  /** "30 de noviembre de 2026", already formatted. */
  endsAtLabel?: string;
  message?: string;
}

const toHtmlLines = (text: string): string => escapeHtml(text).replace(/\r?\n/g, "<br>");

const renderCouponGift = (input: CouponGiftInput): RenderedMail => {
  const details = [
    input.endsAtLabel ? `Vigente hasta el ${input.endsAtLabel}` : null,
    input.minSubtotalLabel ? `Compra mínima ${input.minSubtotalLabel}` : null,
  ].filter((line): line is string => line !== null);

  const html = layout(
    "Un detalle para tu próxima compra",
    `<p>Hola ${escapeHtml(input.firstName)}, queremos agradecerte por ser parte de Gira.</p>` +
      `<div style="border:2px dashed #0d0d0d;background:#d9f2d0;padding:16px;text-align:center;margin:16px 0">` +
      `<div style="font-size:14px">${escapeHtml(input.discountLabel)}</div>` +
      `<div style="font-family:monospace;font-size:24px;font-weight:700;margin:6px 0">${escapeHtml(input.code)}</div>` +
      details.map((line) => `<div style="font-size:12px;color:#3d3a33">${escapeHtml(line)}</div>`).join("") +
      `</div>` +
      (input.message ? `<p data-message style="font-size:16px">${toHtmlLines(input.message)}</p>` : "") +
      `<p><a href="${escapeHtml(env.clientUrl)}" style="background:#f5ff3d;color:#0d0d0d;padding:10px 20px;border:2px solid #0d0d0d;text-decoration:none;font-weight:700">Ir a la tienda</a></p>` +
      `<p style="font-size:12px;color:#666">Este cupón es personal. Si no lo quieres, ignora este mensaje.</p>`,
  );

  const text = [
    `Hola ${input.firstName}, queremos agradecerte por ser parte de Gira.`,
    "",
    `${input.discountLabel}: ${input.code}`,
    ...details,
    ...(input.message ? ["", input.message] : []),
    "",
    `Ir a la tienda: ${env.clientUrl}`,
    "Este cupón es personal. Si no lo quieres, ignora este mensaje.",
  ].join("\n");

  return { subject: "Un detalle de Gira para ti", html, text };
};

export type { CouponGiftInput };
export { renderCouponGift };
