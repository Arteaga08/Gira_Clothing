import { describe, it, expect } from "vitest";
import { Currency } from "@gira/shared";
import {
  renderTeamOrderPaid,
  renderTeamPaymentFailed,
  renderTeamPaymentNeedsReview,
  renderTeamDisputeLost,
  renderTeamShipmentIncident,
} from "../../src/templates/teamMessages.js";

const ORDER_NUMBER = "GC-7KQ2M9XA";
// A publicId is 43 base64url characters: nothing of that shape may reach Telegram.
const LOOKS_LIKE_PUBLIC_ID = /[A-Za-z0-9_-]{43}/;

const textOf = (message: { title: string; lines: string[] }): string =>
  [message.title, ...message.lines].join("\n");

describe("avisos de equipo (Telegram)", () => {
  it("la venta lleva el folio legible", () => {
    const message = renderTeamOrderPaid({
      orderNumber: ORDER_NUMBER,
      total: 25000,
      currency: Currency.MXN,
      itemCount: 2,
    });

    expect(textOf(message)).toContain(`Folio: ${ORDER_NUMBER}`);
    expect(textOf(message)).not.toMatch(LOOKS_LIKE_PUBLIC_ID);
  });

  it.each([
    ["pago rechazado", () => renderTeamPaymentFailed(ORDER_NUMBER, "card_declined")],
    ["revisión", () => renderTeamPaymentNeedsReview(ORDER_NUMBER, "payment_after_expiry")],
    ["disputa perdida", () => renderTeamDisputeLost(ORDER_NUMBER)],
    ["incidencia de envío", () => renderTeamShipmentIncident(ORDER_NUMBER, "lost", "Estafeta")],
  ])("%s lleva el folio", (_name, render) => {
    expect(textOf(render())).toContain(`Folio: ${ORDER_NUMBER}`);
  });
});
