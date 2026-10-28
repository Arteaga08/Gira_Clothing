import { describe, it, expect } from "vitest";
import { Currency } from "@gira/shared";
import {
  renderOrderConfirmation,
  renderOrderPreparing,
  renderOrderShipped,
  renderOrderDelivered,
  renderOrderPaymentFailed,
  renderOrderRefunded,
  formatMoney,
} from "../../src/templates/orderEmails.js";

const snapshot = {
  publicId: "abc123",
  orderNumber: "GC-7KQ2M9XA",
  customerName: "Ana",
  currency: Currency.MXN,
  subtotal: 120000,
  discount: 0,
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
  it("anuncia que el pedido está en proceso sin prometer fecha de entrega", () => {
    const mail = renderOrderPreparing(snapshot);
    expect(mail.subject).toContain("en proceso");
    expect(mail.subject).not.toContain("preparando");
    expect(mail.html).toContain("en proceso");
    expect(mail.html).not.toContain("preparación");
    expect(mail.text).not.toContain("preparando");
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

describe("renderOrderConfirmation · cupón", () => {
  it("muestra el descuento con el código cuando hubo cupón", () => {
    const mail = renderOrderConfirmation({
      ...snapshot,
      discount: 12000,
      couponCode: "VERANO10",
      total: 123000,
    });
    expect(mail.html).toContain("Descuento (VERANO10): -$120.00 MXN");
    expect(mail.text).toContain("Descuento (VERANO10): -$120.00 MXN");
  });
  it("sin cupón no pinta la línea de descuento", () => {
    const mail = renderOrderConfirmation(snapshot);
    expect(mail.html).not.toContain("Descuento");
  });
});

describe("renderOrderPaymentFailed", () => {
  const mail = renderOrderPaymentFailed(snapshot);

  it("avisa con el folio y nunca menciona reembolso", () => {
    expect(mail.subject).toBe("No pudimos cobrar tu pedido GC-7KQ2M9XA");
    expect(`${mail.html} ${mail.text}`.toLowerCase()).not.toContain("reembols");
  });
  it("invita a reintentar desde Mis pedidos, sin filtrar el publicId", () => {
    expect(mail.html).toContain("/cuenta/pedidos");
    expect(mail.text).toContain("/cuenta/pedidos");
    expect(mail.html).not.toContain("abc123");
    expect(mail.text).not.toContain("abc123");
  });
  it("escapa el nombre", () => {
    expect(renderOrderPaymentFailed({ ...snapshot, customerName: "<b>x</b>" }).html).not.toContain("<b>x");
  });
});

describe("renderOrderRefunded", () => {
  const mail = renderOrderRefunded({ ...snapshot, refundedAmount: 135000 });

  it("confirma el monto devuelto con el folio", () => {
    expect(mail.subject).toBe("Te devolvimos el pago de tu pedido GC-7KQ2M9XA");
    expect(mail.html).toContain("$1,350.00 MXN");
    expect(mail.text).toContain("$1,350.00 MXN");
  });
  it("el publicId solo aparece en el enlace", () => {
    expect(mail.html.replace("/orden/abc123", "")).not.toContain("abc123");
  });
});
