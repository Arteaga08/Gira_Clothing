import { describe, it, expect } from "vitest";
import type { ObjectSchema } from "joi";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  emailOnlySchema,
  resetPasswordSchema,
} from "../../src/validators/authValidator.js";

// Same options as the validate() middleware.
const run = (schema: ObjectSchema, body: unknown) =>
  schema.validate(body, { abortEarly: false, stripUnknown: true, convert: true });

const TOKEN = "a".repeat(64);
const base = {
  firstName: "María",
  lastName: "López",
  email: "maria@example.com",
  password: "Segura1234",
};

describe("política de contraseña (registro y reset)", () => {
  it("9 caracteres falla y 10 pasa", () => {
    expect(run(registerSchema, { ...base, password: "Segura123" }).error).toBeDefined();
    expect(run(registerSchema, base).error).toBeUndefined();
  });

  it("pide mayúscula, minúscula y número, y dice qué falta", () => {
    const noUpper = run(registerSchema, { ...base, password: "segura1234" });
    expect(noUpper.error?.message).toMatch(/mayúscula/);
    expect(run(registerSchema, { ...base, password: "SEGURA1234" }).error?.message).toMatch(/minúscula/);
    expect(run(registerSchema, { ...base, password: "SeguraClave" }).error?.message).toMatch(/número/);
  });

  it("el tope es de 72 BYTES, no caracteres: 72 pasa, 73 con emoji falla", () => {
    const exactly72 = `Aa1${"x".repeat(69)}`;
    expect(Buffer.byteLength(exactly72)).toBe(72);
    expect(run(registerSchema, { ...base, password: exactly72 }).error).toBeUndefined();

    const emoji73 = `Aa1${"x".repeat(66)}😀`; // 69 ASCII + 4-byte emoji = 73 bytes, 70 chars
    expect(Buffer.byteLength(emoji73)).toBe(73);
    expect(run(registerSchema, { ...base, password: emoji73 }).error?.message).toMatch(/72/);
  });

  it("reset aplica la misma política", () => {
    expect(run(resetPasswordSchema, { token: TOKEN, password: "Corta1" }).error).toBeDefined();
    expect(run(resetPasswordSchema, { token: TOKEN, password: "Segura1234" }).error).toBeUndefined();
  });
});

describe("registro: nombres, correo y mass assignment", () => {
  it("nombre y apellido entre 2 y 60 caracteres, con trim", () => {
    expect(run(registerSchema, { ...base, firstName: " M " }).error).toBeDefined();
    expect(run(registerSchema, { ...base, lastName: "x".repeat(61) }).error).toBeDefined();
    expect(run(registerSchema, { ...base, firstName: "  Ana  " }).value.firstName).toBe("Ana");
  });

  it("el nombre solo lleva letras, espacios, apóstrofo, punto y guion (nada de enlaces ni teléfonos)", () => {
    for (const ok of ["María José", "O'Connor", "Ana-Lucía", "J. Pérez", "Nguyễn"]) {
      expect(run(registerSchema, { ...base, firstName: ok }).error).toBeUndefined();
    }
    for (const bad of ["Llama al 5512345678", "gira.mx/pago", "Hola: urgente", "<b>Ana</b>"]) {
      expect(run(registerSchema, { ...base, firstName: bad }).error?.message).toMatch(/solo puede llevar letras/);
    }
  });

  it("el correo no pasa de 254 caracteres", () => {
    const labels = ["b", "c", "d"].map((c) => c.repeat(60)).join(".");
    const long = `${"a".repeat(64)}@${labels}.eee.com`; // DNS labels <= 63, total 254 + 1
    expect(long.length).toBe(255);
    expect(run(registerSchema, { ...base, email: long }).error).toBeDefined();
  });

  it("descarta role y emailVerified", () => {
    const { value, error } = run(registerSchema, { ...base, role: "admin", emailVerified: true });
    expect(error).toBeUndefined();
    expect(value).not.toHaveProperty("role");
    expect(value).not.toHaveProperty("emailVerified");
  });
});

describe("login y verify-email no aplican la política", () => {
  it("login acepta una contraseña corta (falla luego con el mensaje genérico)", () => {
    expect(run(loginSchema, { email: base.email, password: "abc" }).error).toBeUndefined();
  });

  it("verify-email pide el campo y solo topa en 72 bytes", () => {
    expect(run(verifyEmailSchema, { token: TOKEN, password: "abc" }).error).toBeUndefined();
    expect(run(verifyEmailSchema, { token: TOKEN }).error).toBeDefined();
    expect(run(verifyEmailSchema, { token: TOKEN, password: "x".repeat(73) }).error).toBeDefined();
  });

  it("el token debe ser de 64 hex", () => {
    expect(run(verifyEmailSchema, { token: "zz", password: "abc" }).error).toBeDefined();
    expect(run(resetPasswordSchema, { token: "A".repeat(64), password: "Segura1234" }).error).toBeDefined();
  });

  it("los formularios de solo correo normalizan", () => {
    expect(run(emailOnlySchema, { email: " ANA@Example.com " }).value.email).toBe("ana@example.com");
  });
});
