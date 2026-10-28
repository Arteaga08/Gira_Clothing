import { describe, expect, it } from "vitest";
import {
  EMPTY_BILLING_VALUES,
  sanitizeFiscalPostalCode,
  sanitizeRfc,
  validateBilling,
  valuesToBillingRequest,
} from "@/lib/account/billingValidation";

const VALID = { rfc: "LOMM910312AB1", legalName: "María López Martínez", fiscalRegime: "612", cfdiUse: "G03", postalCode: "06000" };

describe("validateBilling", () => {
  it("datos completos no tienen errores; un RFC de persona moral con & y Ñ es válido", () => {
    expect(validateBilling(VALID)).toEqual({});
    expect(validateBilling({ ...VALID, rfc: "A&A910312AB1" })).toEqual({});
    expect(validateBilling({ ...VALID, rfc: "ÑAB910312AB1" })).toEqual({});
  });

  it("explica los cinco campos vacíos", () => {
    expect(Object.keys(validateBilling(EMPTY_BILLING_VALUES)).sort()).toEqual(["cfdiUse", "fiscalRegime", "legalName", "postalCode", "rfc"]);
  });

  it("rechaza un RFC mal formado, un código fuera de catálogo y marcado en la razón social", () => {
    expect(validateBilling({ ...VALID, rfc: "LOMM9103AB1" }).rfc).toMatch(/12 o 13/);
    expect(validateBilling({ ...VALID, fiscalRegime: "999" }).fiscalRegime).toBeDefined();
    expect(validateBilling({ ...VALID, cfdiUse: "ZZ9" }).cfdiUse).toBeDefined();
    expect(validateBilling({ ...VALID, legalName: "Empresa <script>" }).legalName).toMatch(/no permitidos/);
    expect(validateBilling({ ...VALID, postalCode: "6000" }).postalCode).toMatch(/5 dígitos/);
  });
});

describe("helpers", () => {
  it("el RFC se escribe en mayúsculas, sin espacios y se corta en 13", () => {
    expect(sanitizeRfc(" lomm 910312 ab1xyz")).toBe("LOMM910312AB1");
  });

  it("el código postal fiscal solo admite 5 dígitos", () => {
    expect(sanitizeFiscalPostalCode("06-0001")).toBe("06000");
  });

  it("la razón social se recorta al enviar", () => {
    expect(valuesToBillingRequest({ ...VALID, legalName: "  María  " }).legalName).toBe("María");
  });
});
