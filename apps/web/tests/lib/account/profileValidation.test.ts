import { describe, expect, it } from "vitest";
import {
  birthDateError,
  cityError,
  phoneError,
  sanitizePhone,
  todayIso,
  validateProfile,
  valuesToRequest,
} from "@/lib/account/profileValidation";

const VALID = { firstName: "María", lastName: "López", phone: "", birthDate: "", city: "" };

describe("profileValidation", () => {
  it("sanitizePhone: deja solo dígitos y corta en 10", () => {
    expect(sanitizePhone("55 1234-5678 99")).toBe("5512345678");
    expect(sanitizePhone("abc")).toBe("");
  });

  it("phoneError: vacío es válido; menos de 10 dígitos no", () => {
    expect(phoneError("")).toBeNull();
    expect(phoneError("5512345678")).toBeNull();
    expect(phoneError("55123")).toBe("Escribe los 10 dígitos de tu celular, sin espacios ni guiones.");
  });

  it("birthDateError: rechaza futura y anterior a 1900, acepta hoy", () => {
    expect(birthDateError("")).toBeNull();
    expect(birthDateError("2026-10-27", "2026-10-27")).toBeNull();
    expect(birthDateError("2026-10-28", "2026-10-27")).toBe("La fecha no puede ser futura.");
    expect(birthDateError("1899-12-31", "2026-10-27")).toBe("La fecha es demasiado antigua.");
    expect(birthDateError("17/05/1990", "2026-10-27")).toBe("Escribe una fecha válida.");
  });

  it("todayIso: usa la fecha local, no la UTC", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("cityError: límite y sin < >", () => {
    expect(cityError("Guadalajara")).toBeNull();
    expect(cityError("a".repeat(121))).toMatch(/120/);
    expect(cityError("<b>")).toBe("La ciudad contiene caracteres no permitidos.");
  });

  it("validateProfile: junta los errores por campo", () => {
    expect(validateProfile(VALID)).toEqual({});
    const errors = validateProfile({ ...VALID, firstName: "", phone: "12" });
    expect(Object.keys(errors).sort()).toEqual(["firstName", "phone"]);
  });

  it("valuesToRequest: recorta nombres y manda null en los opcionales vacíos", () => {
    expect(valuesToRequest({ ...VALID, firstName: "  María ", city: "  " })).toEqual({
      firstName: "María",
      lastName: "López",
      phone: null,
      birthDate: null,
      city: null,
    });
    expect(valuesToRequest({ ...VALID, phone: "5512345678", birthDate: "1990-05-17", city: " CDMX " })).toMatchObject({
      phone: "5512345678",
      birthDate: "1990-05-17",
      city: "CDMX",
    });
  });
});
