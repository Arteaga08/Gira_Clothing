import { PaymentStatus } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { REFUND_REQUEST_STALE_MS } from "@gira/shared";
import { PAYMENT_STATUS_LABELS, isRefundPending, paymentProviderLabel } from "@/lib/orders/payment";

describe("PAYMENT_STATUS_LABELS", () => {
  it.each(Object.values(PaymentStatus))("%s tiene texto en español", (status) => {
    expect(PAYMENT_STATUS_LABELS[status]).toMatch(/^[A-ZÁÉÍÓÚ]/);
    expect(PAYMENT_STATUS_LABELS[status]).not.toBe(status);
  });

  it("succeeded se lee como Pagado", () => {
    expect(PAYMENT_STATUS_LABELS[PaymentStatus.SUCCEEDED]).toBe("Pagado");
  });
});

describe("paymentProviderLabel", () => {
  it("escribe Stripe con su nombre propio y deja pasar uno desconocido", () => {
    expect(paymentProviderLabel("stripe")).toBe("Stripe");
    expect(paymentProviderLabel("otro")).toBe("otro");
  });
});

describe("isRefundPending", () => {
  const NOW = Date.parse("2026-10-20T12:00:00.000Z");
  const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

  it("sin solicitud no hay reembolso pendiente", () => {
    expect(isRefundPending({}, NOW)).toBe(false);
  });

  it("una solicitud reciente sigue pendiente", () => {
    expect(isRefundPending({ refundRequestedAt: at(60_000) }, NOW)).toBe(true);
  });

  it("pasada la ventana sin confirmación vuelve a poder pedirse", () => {
    expect(isRefundPending({ refundRequestedAt: at(REFUND_REQUEST_STALE_MS + 1) }, NOW)).toBe(false);
  });

  it("una fecha inválida no bloquea el botón", () => {
    expect(isRefundPending({ refundRequestedAt: "no-es-fecha" }, NOW)).toBe(false);
  });
});
