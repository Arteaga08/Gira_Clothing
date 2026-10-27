import { describe, expect, it } from "vitest";
import { checkPassword, passwordError } from "@/lib/auth/password";

describe("checkPassword", () => {
  it("vacía: ninguna regla cumplida, sin etiqueta", () => {
    const check = checkPassword("");
    expect(check.score).toBe(0);
    expect(check.valid).toBe(false);
    expect(check.strength).toBe("");
    expect(check.rules.map((rule) => rule.met)).toEqual([false, false, false, false]);
  });

  it("válida: las cuatro reglas, «Fuerte»", () => {
    const check = checkPassword("Gira2026xyz");
    expect(check.valid).toBe(true);
    expect(check.score).toBe(4);
    expect(check.strength).toBe("Fuerte");
  });

  it("sin número: falla solo esa regla y es «Buena»", () => {
    const check = checkPassword("GiraGiraGira");
    expect(check.valid).toBe(false);
    expect(check.score).toBe(3);
    expect(check.strength).toBe("Buena");
    expect(check.rules.find((rule) => rule.id === "digit")?.met).toBe(false);
  });

  it("corta (9 caracteres) no cumple la regla de largo", () => {
    expect(checkPassword("Gira2026x").valid).toBe(false);
    expect(checkPassword("Gira2026xy").valid).toBe(true);
  });

  it("el tope de 72 se mide en bytes: los acentos cuentan doble", () => {
    const base = "Aa1" + "a".repeat(67); // 70 bytes
    expect(checkPassword(base + "ñ").valid).toBe(true); // ñ = 2 bytes → 72 exactos
    expect(checkPassword(base + "ññ").valid).toBe(false); // 74
  });

  it("pasar de 72 bytes marca tooLong", () => {
    const check = checkPassword("Aa1" + "a".repeat(70));
    expect(check.tooLong).toBe(true);
    expect(check.valid).toBe(false);
  });
});

describe("passwordError", () => {
  it("vacía pide escribirla", () => {
    expect(passwordError("")).toBe("Escribe una contraseña.");
  });

  it("lista lo que falta", () => {
    expect(passwordError("hola")).toBe(
      "Te falta al menos 10 caracteres, una mayúscula y un número.",
    );
    expect(passwordError("holaholahola1")).toBe("Te falta una mayúscula.");
  });

  it("pasada de bytes lo dice", () => {
    expect(passwordError("Aa1" + "a".repeat(70))).toBe(
      "La contraseña no puede pasar de 72 bytes (acentos y emojis cuentan más de uno).",
    );
  });

  it("válida no devuelve error", () => {
    expect(passwordError("Gira2026xyz")).toBeNull();
  });
});
