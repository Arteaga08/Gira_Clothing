import { describe, it, expect, vi, afterEach } from "vitest";
import { renderCouponGift } from "../../src/templates/couponEmails.js";
import { sendCouponEmail } from "../../src/services/couponMailService.js";
import { getMailer } from "../../src/adapters/mailer/index.js";

const base = {
  firstName: "Ana",
  code: "GRACIAS-ANA",
  discountLabel: "15% de descuento",
};

describe("renderCouponGift", () => {
  it("incluye código, descuento y vigencia", () => {
    const mail = renderCouponGift({ ...base, endsAtLabel: "30 de noviembre de 2026", minSubtotalLabel: "$800.00" });
    expect(mail.subject).toBe("Un detalle de Gira para ti");
    expect(mail.html).toContain("GRACIAS-ANA");
    expect(mail.html).toContain("15% de descuento");
    expect(mail.html).toContain("Vigente hasta el 30 de noviembre de 2026");
    expect(mail.html).toContain("Compra mínima $800.00");
    expect(mail.text).toContain("GRACIAS-ANA");
  });

  it("escapa el mensaje del admin y el nombre (no es HTML)", () => {
    const mail = renderCouponGift({
      ...base,
      firstName: `<img src=x onerror=alert(1)>`,
      message: `<script>alert("x")</script>\nSegunda línea & más`,
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&amp; más");
    expect(mail.html).toContain("<br>");
    expect(mail.text).toContain("Segunda línea & más");
  });

  it("sin mensaje no deja un bloque vacío", () => {
    expect(renderCouponGift(base).html).not.toContain("data-message");
  });
});

describe("sendCouponEmail", () => {
  afterEach(() => vi.restoreAllMocks());

  it("devuelve true cuando el proveedor acepta", async () => {
    const spy = vi.spyOn(getMailer(), "send").mockResolvedValue({ providerId: "x" });
    expect(await sendCouponEmail({ to: "ana@example.com", ...base })).toBe(true);
    expect(spy.mock.calls[0]![0]).toMatchObject({ to: "ana@example.com" });
  });

  it("devuelve false y no lanza si el proveedor falla", async () => {
    vi.spyOn(getMailer(), "send").mockRejectedValue(new Error("boom"));
    expect(await sendCouponEmail({ to: "ana@example.com", ...base })).toBe(false);
  });
});
