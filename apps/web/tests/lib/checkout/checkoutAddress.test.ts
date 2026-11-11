import { describe, it, expect } from "vitest";
import type { SavedAddress, Wire } from "@gira/shared";
import { EMPTY_ADDRESS_VALUES } from "@/lib/account/addressValidation";
import { destinationOf, fromSaved, fromValues, validateCheckoutValues } from "@/lib/checkout/checkoutAddress";

const saved: Wire<SavedAddress> = {
  id: "6ad9245c612875b3a4962bb5",
  label: "Casa",
  recipient: "Emilio Díaz",
  line1: "Calle Pino 214",
  line2: null,
  district: "Roma Norte",
  city: "CDMX",
  state: "CMX",
  postalCode: "06700",
  country: "MX",
  phone: "5512345678",
  isDefault: true,
};

describe("fromSaved", () => {
  it("arma la dirección del pedido sin la etiqueta ni el id, y separa el celular", () => {
    expect(fromSaved(saved)).toEqual({
      address: {
        recipient: "Emilio Díaz",
        line1: "Calle Pino 214",
        district: "Roma Norte",
        city: "CDMX",
        state: "CMX",
        postalCode: "06700",
        country: "MX",
      },
      phone: "5512345678",
    });
  });

  it("incluye el interior solo si existe", () => {
    expect(fromSaved({ ...saved, line2: "Depto 3" }).address.line2).toBe("Depto 3");
    expect(fromSaved(saved).address).not.toHaveProperty("line2");
  });
});

describe("fromValues", () => {
  it("recorta los espacios y fija el país en México", () => {
    const result = fromValues({
      ...EMPTY_ADDRESS_VALUES,
      recipient: "  Ana  ",
      line1: " Av. Reforma 90 ",
      district: "Juárez",
      city: "CDMX",
      state: "CMX",
      postalCode: "06600",
      phone: "5500000000",
    });
    expect(result.address).toMatchObject({ recipient: "Ana", line1: "Av. Reforma 90", country: "MX" });
    expect(result.phone).toBe("5500000000");
    expect(result.address).not.toHaveProperty("line2");
  });
});

describe("destinationOf", () => {
  it("lo que necesita una cotización: CP, estado y ciudad", () => {
    expect(destinationOf(fromSaved(saved).address)).toEqual({ postalCode: "06700", state: "CMX", city: "CDMX" });
  });
});

describe("validateCheckoutValues", () => {
  it("usa las mismas reglas de la dirección guardada", () => {
    const errors = validateCheckoutValues(EMPTY_ADDRESS_VALUES);
    expect(errors.recipient).toBeDefined();
    expect(errors.postalCode).toBeDefined();
    expect(errors.phone).toBeDefined();
  });

  it("no exige ni valida la etiqueta (no se guarda)", () => {
    const errors = validateCheckoutValues({ ...EMPTY_ADDRESS_VALUES, label: "<x>".repeat(30) });
    expect(errors.label).toBeUndefined();
  });
});
