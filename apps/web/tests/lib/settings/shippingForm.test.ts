import { describe, expect, it } from "vitest";
import { toShippingBody, validateShippingForm, valuesFromSettings } from "@/lib/settings/shippingForm";

const SHIPPING = {
  origin: null,
  freeShippingThreshold: null,
  parcel: { tareGrams: 150, boxLengthCm: 30, boxWidthCm: 25, boxHeightCm: 5, extraUnitHeightCm: 3, maxWeightGrams: 20000 },
  quoteTtlMinutes: 30,
};

const filled = () => ({
  ...valuesFromSettings(SHIPPING),
  name: "Gira Clothing",
  phone: "5512345678",
  line1: "Av. Juárez 10",
  district: "Centro",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "06000",
});

describe("shippingForm", () => {
  it("sin origen arranca vacío y sin envío gratis", () => {
    const values = valuesFromSettings(SHIPPING);
    expect(values.name).toBe("");
    expect(values.freeShippingEnabled).toBe(false);
    expect(values.parcel.tareGrams).toBe("150");
    expect(validateShippingForm(values)).toMatchObject({
      name: expect.any(String),
      phone: "El teléfono tiene 10 dígitos.",
      state: "Elige un estado de la lista.",
      postalCode: "El código postal tiene 5 dígitos.",
    });
  });

  it("un formulario completo es válido y arma el cuerpo en centavos y enteros", () => {
    const values = { ...filled(), email: " Dueno@Example.com ", freeShippingEnabled: true, freeShippingPesos: "1500.50" };
    expect(validateShippingForm(values)).toEqual({});
    expect(toShippingBody(values)).toEqual({
      origin: {
        name: "Gira Clothing",
        phone: "5512345678",
        email: "dueno@example.com",
        line1: "Av. Juárez 10",
        district: "Centro",
        city: "Ciudad de México",
        state: "CX",
        postalCode: "06000",
      },
      freeShippingThreshold: 150050,
      parcel: SHIPPING.parcel,
      quoteTtlMinutes: 30,
    });
  });

  it("envío gratis apagado manda null y no valida el monto", () => {
    const values = { ...filled(), freeShippingEnabled: false, freeShippingPesos: "abc" };
    expect(validateShippingForm(values)).toEqual({});
    expect(toShippingBody(values).freeShippingThreshold).toBeNull();
  });

  it("rechaza monto inválido, correo inválido y medidas fuera de rango", () => {
    const values = {
      ...filled(),
      email: "no-es-correo",
      freeShippingEnabled: true,
      freeShippingPesos: "10.999",
      parcel: { ...filled().parcel, boxLengthCm: "0", maxWeightGrams: "2.5" },
      quoteTtlMinutes: "300",
    };
    expect(validateShippingForm(values)).toEqual({
      email: "Escribe un correo válido.",
      freeShippingPesos: "Escribe un monto en pesos, como 1500 o 1500.50.",
      "parcel.boxLengthCm": "Debe estar entre 1 y 200.",
      "parcel.maxWeightGrams": "Escribe un número entero.",
      quoteTtlMinutes: "Debe estar entre 5 y 240.",
    });
  });
});
