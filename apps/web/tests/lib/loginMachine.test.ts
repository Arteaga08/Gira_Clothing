import { INVALID_CREDENTIALS_MESSAGE, TWO_FACTOR_INVALID_MESSAGE } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { initialLoginState, loginReducer, type LoginState } from "@/lib/auth/loginMachine";

const inPhase = (phase: LoginState["phase"], pending = false): LoginState => ({
  phase,
  pending,
  error: null,
});

describe("loginReducer", () => {
  it("submit desde credentials pone pending y limpia el error", () => {
    const next = loginReducer(initialLoginState, { type: "submit" });
    expect(next).toEqual({ phase: "credentials", pending: true, error: null });
  });

  it("challenge twoFactor pasa a la fase de código sin marcar error (es un paso, no un fallo)", () => {
    const next = loginReducer(inPhase("credentials", true), { type: "challenge", next: "twoFactor" });
    expect(next).toEqual({ phase: "twoFactor", pending: false, error: null });
  });

  it("challenge enroll pasa a la fase de enrolamiento", () => {
    const next = loginReducer(inPhase("credentials", true), { type: "challenge", next: "enroll" });
    expect(next).toEqual({ phase: "enroll", pending: false, error: null });
  });

  it("failure con credenciales inválidas se queda en credentials con el error visible", () => {
    const next = loginReducer(inPhase("credentials", true), {
      type: "failure",
      message: INVALID_CREDENTIALS_MESSAGE,
      status: 401,
    });
    expect(next).toEqual({ phase: "credentials", pending: false, error: INVALID_CREDENTIALS_MESSAGE });
  });

  it("código incorrecto (400) se queda en twoFactor con el error visible", () => {
    const next = loginReducer(inPhase("twoFactor", true), {
      type: "failure",
      message: TWO_FACTOR_INVALID_MESSAGE,
      status: 400,
    });
    expect(next).toEqual({ phase: "twoFactor", pending: false, error: TWO_FACTOR_INVALID_MESSAGE });
  });

  it("bloqueo (429) en twoFactor conserva la fase y muestra el mensaje del servidor", () => {
    const message = "Demasiados códigos incorrectos. Intenta de nuevo en 15 minutos.";
    const next = loginReducer(inPhase("twoFactor", true), { type: "failure", message, status: 429 });
    expect(next).toEqual({ phase: "twoFactor", pending: false, error: message });
  });

  it("401 en twoFactor significa reto expirado: vuelve a credentials con el error", () => {
    const message = "Tu verificación expiró. Inicia sesión de nuevo.";
    const next = loginReducer(inPhase("twoFactor", true), { type: "failure", message, status: 401 });
    expect(next).toEqual({ phase: "credentials", pending: false, error: message });
  });

  it("401 en enroll significa reto expirado: vuelve a credentials con el error", () => {
    const message = "Tu verificación expiró. Inicia sesión de nuevo.";
    const next = loginReducer(inPhase("enroll", true), { type: "failure", message, status: 401 });
    expect(next).toEqual({ phase: "credentials", pending: false, error: message });
  });

  it("failure de red conserva la fase actual y muestra el mensaje de red", () => {
    const message = "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
    const next = loginReducer(inPhase("twoFactor", true), { type: "failure", message, status: 0 });
    expect(next).toEqual({ phase: "twoFactor", pending: false, error: message });
  });

  it("success mantiene pending:true — se queda ocupado durante la navegación", () => {
    const next = loginReducer(inPhase("twoFactor", true), { type: "success" });
    expect(next).toEqual({ phase: "twoFactor", pending: true, error: null });
  });
});
