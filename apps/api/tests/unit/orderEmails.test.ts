import { describe, it, expect } from "vitest";
import { Currency } from "@gira/shared";
import {
  renderOrderConfirmation,
  renderOrderPreparing,
  renderOrderShipped,
  formatMoney,
} from "../../src/templates/orderEmails.js";

const snapshot = {
  publicId: "abc123",
  customerName: "Ana",
  currency: Currency.MXN,
  subtotal: 120000,
  shippingCost: 15000,
  total: 135000,
  lines: [{ productName: "Tote", printName: "Amapolas", qty: 2, lineTotal: 120000 }],
};

describe("formatMoney", () => {
  it("formatea centavos a pesos con dos decimales", () => {
    expect(formatMoney(135000, Currency.MXN)).toBe("$1,350.00 MXN");
  });
  it("formatea dólares con su sufijo", () => {
    expect(formatMoney(5650, Currency.USD)).toBe("$56.50 USD");
  });
  it("formatea cero", () => {
    expect(formatMoney(0, Currency.MXN)).toBe("$0.00 MXN");
  });
});

describe("renderOrderConfirmation", () => {
  const mail = renderOrderConfirmation(snapshot);

  it("escribe el asunto en español y sin el publicId", () => {
    expect(mail.subject).toBe("Confirmamos tu compra en Gira Clothing");
  });
  it("incluye las líneas, el total y el enlace a la orden", () => {
    expect(mail.html).toContain("Tote");
    expect(mail.html).toContain("Amapolas");
    expect(mail.html).toContain("$1,350.00 MXN");
    expect(mail.html).toContain("/orden/abc123");
  });
  it("escapa el HTML de los datos de la clienta", () => {
    const evil = { ...snapshot, customerName: "<script>alert(1)</script>" };
    expect(renderOrderConfirmation(evil).html).not.toContain("<script>");
  });
  it("entrega también una versión de texto plano no vacía", () => {
    expect(mail.text.length).toBeGreaterThan(0);
    expect(mail.text).not.toContain("<");
  });
});

describe("renderOrderPreparing", () => {
  it("anuncia la preparación sin prometer fecha de entrega", () => {
    const mail = renderOrderPreparing(snapshot);
    expect(mail.subject).toContain("preparando");
    expect(mail.html).toContain("/orden/abc123");
  });
});

describe("renderOrderShipped", () => {
  const mail = renderOrderShipped({
    ...snapshot,
    carrier: "Estafeta",
    trackingNumber: "1234567890",
  });

  it("incluye paquetería, número de guía y el enlace de seguimiento", () => {
    expect(mail.html).toContain("Estafeta");
    expect(mail.html).toContain("1234567890");
    expect(mail.html).toContain("/orden/abc123/seguimiento");
  });
});
