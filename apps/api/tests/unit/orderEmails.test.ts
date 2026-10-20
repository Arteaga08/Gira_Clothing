import { describe, it, expect } from "vitest";
import { Currency } from "@gira/shared";
import {
  renderOrderConfirmation,
  renderOrderPreparing,
  renderOrderShipped,
  renderOrderDelivered,
  formatMoney,
} from "../../src/templates/orderEmails.js";

const snapshot = {
  publicId: "abc123",
  orderNumber: "GC-7KQ2M9XA",
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

  it("escribe el asunto en español con el folio y sin el publicId", () => {
    expect(mail.subject).toBe("Confirmamos tu compra GC-7KQ2M9XA en Gira Clothing");
    expect(mail.subject).not.toContain("abc123");
  });
  it("muestra el folio en el cuerpo (html y texto) y el publicId solo en el enlace", () => {
    expect(mail.html).toContain("GC-7KQ2M9XA");
    expect(mail.text).toContain("Folio: GC-7KQ2M9XA");
    expect(mail.html.replace("/orden/abc123", "")).not.toContain("abc123");
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
    expect(mail.subject).toContain("GC-7KQ2M9XA");
    expect(mail.html).toContain("GC-7KQ2M9XA");
    expect(mail.html).toContain("/orden/abc123");
  });
});

const shipped = {
  ...snapshot,
  carrierName: "Estafeta",
  trackingNumber: "794644790138",
  trackUrl: "https://envia.test/track/794644790138",
};

describe("renderOrderShipped", () => {
  const mail = renderOrderShipped(shipped);
  it("usa el folio en el asunto y nunca el publicId", () => {
    expect(mail.subject).toBe("Tu pedido GC-7KQ2M9XA va en camino");
    expect(mail.subject).not.toContain("abc123");
  });
  it("muestra paquetería por nombre, guía y el enlace de rastreo de la paquetería", () => {
    expect(mail.html).toContain("Estafeta");
    expect(mail.html).toContain("794644790138");
    expect(mail.html).toContain("https://envia.test/track/794644790138");
    expect(mail.text).toContain("https://envia.test/track/794644790138");
  });
  it("el publicId solo aparece en el enlace propio", () => {
    expect(mail.html).toContain("/orden/abc123/seguimiento");
    expect(mail.html.replace("/orden/abc123/seguimiento", "")).not.toContain("abc123");
  });
  it("omite el enlace de la paquetería si no hay trackUrl y escapa el HTML", () => {
    const m = renderOrderShipped({ ...shipped, trackUrl: undefined, carrierName: "<b>x</b>" });
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).not.toContain("undefined");
  });
});

describe("renderOrderDelivered", () => {
  const mail = renderOrderDelivered(shipped);
  it("avisa que llegó, con folio y guía", () => {
    expect(mail.subject).toBe("Tu pedido GC-7KQ2M9XA llegó");
    expect(mail.html).toContain("794644790138");
    expect(mail.text).toContain("Folio: GC-7KQ2M9XA");
  });
  it("no filtra el publicId fuera del enlace", () => {
    expect(mail.html.replace("/orden/abc123", "")).not.toContain("abc123");
  });
});
