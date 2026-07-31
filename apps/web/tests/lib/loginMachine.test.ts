import {
  INVALID_CREDENTIALS_MESSAGE,
  TWO_FACTOR_INVALID_MESSAGE,
  TWO_FACTOR_REQUIRED_MESSAGE,
} from "@gira/shared";
import { describe, expect, it } from "vitest";
import { initialLoginState, loginReducer } from "@/lib/auth/loginMachine";

describe("loginReducer", () => {
  it("submit desde credentials pone pending y limpia el error", () => {
    const next = loginReducer(initialLoginState, { type: "submit" });
    expect(next).toEqual({ phase: "credentials", pending: true, error: null });
  });

  it("failure con el mensaje exacto de 2FA pasa a twoFactor sin marcar error (es un paso, no un fallo)", () => {
    const pending = loginReducer(initialLoginState, { type: "submit" });
    const next = loginReducer(pending, {
      type: "failure",
      message: TWO_FACTOR_REQUIRED_MESSAGE,
      status: 401,
    });
    expect(next).toEqual({ phase: "twoFactor", pending: false, error: null });
  });

  it("failure con credenciales inválidas se queda en credentials con el error visible", () => {
    const pending = loginReducer(initialLoginState, { type: "submit" });
    const next = loginReducer(pending, {
      type: "failure",
      message: INVALID_CREDENTIALS_MESSAGE,
      status: 401,
    });
    expect(next).toEqual({
      phase: "credentials",
      pending: false,
      error: INVALID_CREDENTIALS_MESSAGE,
    });
  });

  it("failure con código incorrecto se queda en twoFactor con el error visible", () => {
    const twoFactorState = { phase: "twoFactor" as const, pending: true, error: null };
    const next = loginReducer(twoFactorState, {
      type: "failure",
      message: TWO_FACTOR_INVALID_MESSAGE,
      status: 401,
    });
    expect(next).toEqual({
      phase: "twoFactor",
      pending: false,
      error: TWO_FACTOR_INVALID_MESSAGE,
    });
  });

  it("failure con longitud de código inválida se queda en twoFactor con el error visible", () => {
    const twoFactorState = { phase: "twoFactor" as const, pending: true, error: null };
    const message = "El código de verificación debe tener 6 dígitos.";
    const next = loginReducer(twoFactorState, { type: "failure", message, status: 400 });
    expect(next).toEqual({ phase: "twoFactor", pending: false, error: message });
  });

  it("failure 429 conserva la fase actual y muestra el mensaje del servidor", () => {
    const pending = loginReducer(initialLoginState, { type: "submit" });
    const message = "Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.";
    const next = loginReducer(pending, { type: "failure", message, status: 429 });
    expect(next).toEqual({ phase: "credentials", pending: false, error: message });
  });

  it("failure de red conserva la fase actual y muestra el mensaje de red", () => {
    const pending = loginReducer(initialLoginState, { type: "submit" });
    const message = "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
    const next = loginReducer(pending, { type: "failure", message, status: 0 });
    expect(next).toEqual({ phase: "credentials", pending: false, error: message });
  });

  it("success mantiene pending:true — se queda ocupado durante la navegación", () => {
    const pending = loginReducer(initialLoginState, { type: "submit" });
    const next = loginReducer(pending, { type: "success" });
    expect(next).toEqual({ phase: "credentials", pending: true, error: null });
  });
});
