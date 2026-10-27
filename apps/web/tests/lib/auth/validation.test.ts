import { describe, expect, it } from "vitest";
import { confirmPasswordError, emailError, nameError } from "@/lib/auth/validation";

describe("emailError", () => {
  it("vacío, sin @ y sin dominio dicen qué falta", () => {
    expect(emailError("")).toBe("Falta tu correo.");
    expect(emailError("   ")).toBe("Falta tu correo.");
    expect(emailError("maria.lopez")).toBe("Al correo le falta la @, por ejemplo maria.lopez@correo.mx.");
    expect(emailError("maria.lopez@")).toBe("Al correo le falta el dominio, por ejemplo maria.lopez@correo.mx.");
    expect(emailError("maria@correo")).toBe("Al correo le falta el dominio, por ejemplo maria.lopez@correo.mx.");
  });

  it("uno válido (con espacios alrededor) no da error", () => {
    expect(emailError("  maria.lopez@correo.mx ")).toBeNull();
  });
});

describe("nameError", () => {
  it("pide el campo por su nombre y al menos 2 letras", () => {
    expect(nameError("", "nombre")).toBe("Falta tu nombre.");
    expect(nameError(" ", "apellido")).toBe("Falta tu apellido.");
    expect(nameError("A", "nombre")).toBe("Escribe al menos 2 letras.");
    expect(nameError("María José", "nombre")).toBeNull();
    expect(nameError("O'Brien-López", "apellido")).toBeNull();
  });

  it("rechaza dígitos y símbolos que el API también rechaza", () => {
    expect(nameError("Ma2ia", "nombre")).toBe("Usa solo letras en tu nombre.");
    expect(nameError("http://x.mx", "apellido")).toBe("Usa solo letras en tu apellido.");
  });
});

describe("confirmPasswordError", () => {
  it("pide repetirla y compara", () => {
    expect(confirmPasswordError("Gira2026xyz", "")).toBe("Repite tu contraseña.");
    expect(confirmPasswordError("Gira2026xyz", "Gira2026xy")).toBe("Las contraseñas no coinciden.");
    expect(confirmPasswordError("Gira2026xyz", "Gira2026xyz")).toBeNull();
  });
});
