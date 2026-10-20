import type { ShippingAddress } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { validateAddress } from "@/lib/orders/address";

const valid: ShippingAddress = {
  recipient: "Ana Sofía Ruiz",
  line1: "Av. Chapultepec 1247",
  line2: "Int. 4B",
  district: "Americana",
  city: "Guadalajara",
  state: "JC",
  postalCode: "44160",
  country: "MX",
};

describe("validateAddress", () => {
  it("una dirección completa no tiene errores", () => {
    expect(validateAddress(valid)).toEqual({});
  });

  it("la línea 2 es opcional y puede quedar vacía", () => {
    expect(validateAddress({ ...valid, line2: "" })).toEqual({});
  });

  it("marca cada campo obligatorio vacío o demasiado corto", () => {
    const errors = validateAddress({ ...valid, recipient: "A", line1: "ab", district: "", city: " " });
    expect(Object.keys(errors).sort()).toEqual(["city", "district", "line1", "recipient"]);
    expect(errors.recipient).toBe("Escribe al menos 2 caracteres.");
    expect(errors.line1).toBe("Escribe al menos 3 caracteres.");
  });

  it("respeta los máximos del API", () => {
    expect(validateAddress({ ...valid, recipient: "x".repeat(121) }).recipient).toBe("Máximo 120 caracteres.");
    expect(validateAddress({ ...valid, line1: "x".repeat(201) }).line1).toBe("Máximo 200 caracteres.");
    expect(validateAddress({ ...valid, line2: "x".repeat(201) }).line2).toBe("Máximo 200 caracteres.");
  });

  it("el código postal son exactamente 5 dígitos", () => {
    expect(validateAddress({ ...valid, postalCode: "4416" }).postalCode).toBe("El código postal tiene 5 dígitos.");
    expect(validateAddress({ ...valid, postalCode: "4416a" }).postalCode).toBe("El código postal tiene 5 dígitos.");
  });

  it("el estado debe ser uno de los 32 de México", () => {
    expect(validateAddress({ ...valid, state: "ZZ" }).state).toBe("Elige un estado de la lista.");
    expect(validateAddress({ ...valid, state: "CX" }).state).toBeUndefined();
  });

  it("solo se envía a México", () => {
    expect(validateAddress({ ...valid, country: "US" }).country).toBe("Solo hacemos envíos dentro de México.");
  });

  it("los espacios sobrantes no cuentan como contenido", () => {
    expect(validateAddress({ ...valid, recipient: "  A  " }).recipient).toBe("Escribe al menos 2 caracteres.");
  });
});
