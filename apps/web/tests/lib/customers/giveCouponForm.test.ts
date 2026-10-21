import { describe, it, expect } from "vitest";
import { EMPTY_GIVE_VALUES, toGiveBody, validateGiveForm } from "@/lib/customers/giveCouponForm";

const ok = { ...EMPTY_GIVE_VALUES, code: "gracias-ana", percentOff: "15" };

describe("giveCouponForm", () => {
  it("un formulario completo no tiene errores y no pide nombre ni tope", () => {
    expect(validateGiveForm(ok)).toEqual({});
  });

  it("valida código, valor y mensaje", () => {
    expect(validateGiveForm({ ...ok, code: "" }).code).toBeTruthy();
    expect(validateGiveForm({ ...ok, percentOff: "0" }).percentOff).toBeTruthy();
    expect(validateGiveForm({ ...ok, message: "x".repeat(501) }).message).toBe(
      "El mensaje no puede pasar de 500 caracteres.",
    );
  });

  it("monto fijo: rechaza más de 2 decimales y convierte a centavos", () => {
    const fixed = { ...ok, discountType: "fixed" as const, percentOff: "", amountOff: "150.50" };
    expect(validateGiveForm({ ...fixed, amountOff: "10.999" }).amountOff).toBeTruthy();
    expect(toGiveBody(fixed)).toMatchObject({ discountType: "fixed", amountOffMxn: 15_050 });
  });

  it("el cuerpo no manda nombre ni tope, normaliza el código y omite lo vacío", () => {
    const body = toGiveBody({ ...ok, message: "  Gracias  ", minSubtotal: "800", endsAt: "30/11/2026" });
    expect(body).toMatchObject({
      code: "GRACIAS-ANA",
      discountType: "percent",
      percentOff: 15,
      minSubtotalMxn: 80_000,
      message: "Gracias",
    });
    expect(body).not.toHaveProperty("name");
    expect(body).not.toHaveProperty("maxRedemptions");
    expect(body.endsAt).toBe("2026-12-01T05:59:59.000Z");
    expect(toGiveBody(ok)).not.toHaveProperty("message");
    expect(toGiveBody(ok)).not.toHaveProperty("endsAt");
  });
});
