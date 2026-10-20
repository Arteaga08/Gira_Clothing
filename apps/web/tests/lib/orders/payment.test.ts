import { PaymentStatus } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { PAYMENT_STATUS_LABELS, paymentProviderLabel } from "@/lib/orders/payment";

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
