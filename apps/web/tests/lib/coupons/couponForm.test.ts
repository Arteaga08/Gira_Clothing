import { describe, expect, it } from "vitest";
import {
  EMPTY_COUPON_VALUES,
  toCreateBody,
  toUpdateBody,
  validateCouponForm,
  valuesFromCoupon,
  type CouponFormValues,
} from "@/lib/coupons/couponForm";
import { makePanelCoupon } from "../../helpers/coupons";

const valid = (overrides: Partial<CouponFormValues> = {}): CouponFormValues => ({
  ...EMPTY_COUPON_VALUES,
  code: "VERANO10",
  name: "Verano",
  discountType: "percent",
  percentOff: "10",
  ...overrides,
});

describe("validateCouponForm", () => {
  it("un formulario válido no tiene errores", () => {
    expect(validateCouponForm(valid(), false)).toEqual({});
  });

  it("código: obligatorio, caracteres y longitud", () => {
    expect(validateCouponForm(valid({ code: "" }), false).code).toBe("El código es obligatorio.");
    expect(validateCouponForm(valid({ code: "AB C1" }), false).code).toBe("El código solo admite letras, números y guiones.");
    expect(validateCouponForm(valid({ code: "ABC" }), false).code).toBe("El código debe tener entre 4 y 24 caracteres.");
    expect(validateCouponForm(valid({ code: "verano-10" }), false).code).toBeUndefined();
  });

  it("nombre: entre 2 y 80", () => {
    expect(validateCouponForm(valid({ name: "a" }), false).name).toBe("El nombre debe tener entre 2 y 80 caracteres.");
  });

  it("porcentaje: entero entre 1 y 100", () => {
    for (const bad of ["", "0", "101", "10.5", "abc"]) {
      expect(validateCouponForm(valid({ percentOff: bad }), false).percentOff).toBe("Escribe un porcentaje entero entre 1 y 100.");
    }
  });

  it("monto fijo: máximo 2 decimales y entre $1.00 y $100,000.00", () => {
    const fixed = (amountOff: string) => valid({ discountType: "fixed", amountOff });
    expect(validateCouponForm(fixed("150.999"), false).amountOff).toBe("Usa hasta 2 decimales, por ejemplo 150.50.");
    expect(validateCouponForm(fixed("0.50"), false).amountOff).toBe("El monto debe estar entre $1.00 y $100,000.00.");
    expect(validateCouponForm(fixed("100001"), false).amountOff).toBe("El monto debe estar entre $1.00 y $100,000.00.");
    expect(validateCouponForm(fixed("150.50"), false)).toEqual({});
  });

  it("compra mínima: vacía o monto válido", () => {
    expect(validateCouponForm(valid({ minSubtotal: "" }), false)).toEqual({});
    expect(validateCouponForm(valid({ minSubtotal: "799.00" }), false)).toEqual({});
    expect(validateCouponForm(valid({ minSubtotal: "7.999" }), false).minSubtotal).toBe("Usa hasta 2 decimales, por ejemplo 150.50.");
  });

  it("fechas: formato y fin posterior al inicio (el mismo día vale)", () => {
    expect(validateCouponForm(valid({ startsAt: "2026-06-01" }), false).startsAt).toBe("Usa el formato dd/mm/aaaa.");
    expect(validateCouponForm(valid({ startsAt: "10/06/2026", endsAt: "01/06/2026" }), false).endsAt).toBe("Debe ser posterior al inicio.");
    expect(validateCouponForm(valid({ startsAt: "10/06/2026", endsAt: "10/06/2026" }), false)).toEqual({});
  });

  it("tope: vacío o entero de 1 en adelante", () => {
    expect(validateCouponForm(valid({ maxRedemptions: "" }), false)).toEqual({});
    for (const bad of ["0", "-1", "2.5", "x"]) {
      expect(validateCouponForm(valid({ maxRedemptions: bad }), false).maxRedemptions).toBe("Escribe un número entero de 1 en adelante.");
    }
  });

  it("bloqueado: no valida código, tipo ni descuento", () => {
    expect(validateCouponForm(valid({ code: "", percentOff: "" }), true)).toEqual({});
  });
});

describe("toCreateBody", () => {
  it("porcentaje: solo manda lo escrito", () => {
    expect(toCreateBody(valid({ code: " verano10 " }))).toEqual({
      code: "VERANO10",
      name: "Verano",
      discountType: "percent",
      percentOff: 10,
    });
  });

  it("monto fijo en centavos, mínimo, fechas con -06:00 y tope", () => {
    expect(
      toCreateBody(
        valid({
          discountType: "fixed",
          percentOff: "",
          amountOff: "150.50",
          minSubtotal: "799",
          startsAt: "01/06/2026",
          endsAt: "31/08/2026",
          maxRedemptions: "120",
        }),
      ),
    ).toEqual({
      code: "VERANO10",
      name: "Verano",
      discountType: "fixed",
      amountOffMxn: 15050,
      minSubtotalMxn: 79900,
      startsAt: "2026-06-01T06:00:00.000Z",
      endsAt: "2026-09-01T05:59:59.000Z",
      maxRedemptions: 120,
    });
  });
});

describe("toUpdateBody", () => {
  const coupon = makePanelCoupon({ startsAt: "2026-06-01T06:00:00.000Z", endsAt: "2026-09-01T05:59:59.000Z", maxRedemptions: 120 });
  const baseline = valuesFromCoupon(coupon);

  it("valuesFromCoupon refleja el cupón", () => {
    expect(baseline).toMatchObject({
      code: "VERANO10",
      discountType: "percent",
      percentOff: "10",
      startsAt: "01/06/2026",
      endsAt: "31/08/2026",
      maxRedemptions: "120",
      minSubtotal: "",
    });
  });

  it("sin cambios no manda nada", () => {
    expect(toUpdateBody(baseline, baseline, false)).toEqual({});
  });

  it("manda solo lo que cambió, y null al vaciar fechas o tope", () => {
    expect(toUpdateBody({ ...baseline, name: "Otro" }, baseline, false)).toEqual({ name: "Otro" });
    expect(toUpdateBody({ ...baseline, startsAt: "", endsAt: "", maxRedemptions: "" }, baseline, false)).toEqual({
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
    });
    expect(toUpdateBody({ ...baseline, minSubtotal: "500" }, baseline, false)).toEqual({ minSubtotalMxn: 50000 });
  });

  it("cambiar de tipo manda el tipo y el valor nuevo", () => {
    expect(toUpdateBody({ ...baseline, discountType: "fixed", amountOff: "100" }, baseline, false)).toEqual({
      discountType: "fixed",
      amountOffMxn: 10000,
    });
  });

  it("bloqueado nunca manda código, tipo ni descuento", () => {
    const edited = { ...baseline, name: "Otro", code: "OTROCODIGO", percentOff: "50", discountType: "fixed" as const, amountOff: "9" };
    expect(toUpdateBody(edited, baseline, true)).toEqual({ name: "Otro" });
  });
});
