import { describe, expect, it } from "vitest";
import {
  EMPTY_ADDRESS_VALUES,
  addressToValues,
  sanitizeAddressPhone,
  sanitizePostalCode,
  validateAddress,
  valuesToCreateRequest,
  valuesToUpdateRequest,
  type AddressFormValues,
} from "@/lib/account/addressValidation";

const VALID: AddressFormValues = {
  label: "Casa",
  recipient: "María López",
  line1: "Calle Reforma 123",
  line2: "",
  district: "Centro",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "06000",
  phone: "5512345678",
  makeDefault: false,
};

describe("validateAddress", () => {
  it("una dirección completa no tiene errores (etiqueta e interior son opcionales)", () => {
    expect(validateAddress(VALID)).toEqual({});
    expect(validateAddress({ ...VALID, label: "", line2: "" })).toEqual({});
  });

  it("explica cada campo obligatorio vacío", () => {
    const errors = validateAddress(EMPTY_ADDRESS_VALUES);
    expect(Object.keys(errors).sort()).toEqual(["city", "district", "line1", "phone", "postalCode", "recipient", "state"]);
    expect(errors.state).toBe("Elige un estado.");
  });

  it("rechaza código postal, celular, estado y texto con marcado inválidos", () => {
    expect(validateAddress({ ...VALID, postalCode: "123" }).postalCode).toMatch(/5 dígitos/);
    expect(validateAddress({ ...VALID, phone: "55123" }).phone).toMatch(/10 dígitos/);
    expect(validateAddress({ ...VALID, state: "ZZ" }).state).toBe("Elige un estado.");
    expect(validateAddress({ ...VALID, recipient: "<b>x</b>" }).recipient).toMatch(/no permitidos/);
    expect(validateAddress({ ...VALID, label: "x".repeat(41) }).label).toMatch(/40/);
  });
});

describe("sanitizers", () => {
  it("el celular y el código postal solo admiten dígitos y se cortan", () => {
    expect(sanitizeAddressPhone("55-1234 5678 99")).toBe("5512345678");
    expect(sanitizePostalCode("06-000 9")).toBe("06000");
  });
});

describe("requests", () => {
  it("crear omite lo vacío, fija el país y manda makeDefault solo si está activo", () => {
    const body = valuesToCreateRequest({ ...VALID, label: "  ", makeDefault: true });
    expect(body).toEqual({
      recipient: "María López",
      line1: "Calle Reforma 123",
      district: "Centro",
      city: "Ciudad de México",
      state: "CX",
      postalCode: "06000",
      country: "MX",
      phone: "5512345678",
      makeDefault: true,
    });
    expect("line2" in body).toBe(false);
    expect("makeDefault" in valuesToCreateRequest(VALID)).toBe(false);
  });

  it("editar manda null en la etiqueta y el interior vaciados", () => {
    const body = valuesToUpdateRequest({ ...VALID, label: "", line2: " " });
    expect(body.label).toBeNull();
    expect(body.line2).toBeNull();
    expect(body).not.toHaveProperty("country");
  });

  it("addressToValues rellena los opcionales ausentes con cadena vacía", () => {
    const values = addressToValues({ id: "a1", ...VALID, label: null, line2: null, country: "MX", isDefault: true });
    expect(values.label).toBe("");
    expect(values.line2).toBe("");
    expect(values.makeDefault).toBe(false);
  });
});
