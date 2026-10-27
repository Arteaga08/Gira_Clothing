import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { authFailureMessage, isUnverifiedFailure, TOO_MANY_ATTEMPTS_MESSAGE, SERVER_FAILURE_MESSAGE } from "@/lib/auth/authFailures";

describe("authFailureMessage", () => {
  it("429 usa el texto propio, no el del servidor", () => {
    expect(authFailureMessage(new ApiError("x", "http", 429))).toBe(TOO_MANY_ATTEMPTS_MESSAGE);
  });

  it("5xx usa el texto propio", () => {
    expect(authFailureMessage(new ApiError("stack leak", "http", 503))).toBe(SERVER_FAILURE_MESSAGE);
  });

  it("401 usa el mensaje indicado por la pantalla", () => {
    const error = new ApiError("Correo o contraseña incorrectos.", "http", 401);
    expect(authFailureMessage(error, { unauthorized: "Esa no es la contraseña de tu cuenta." })).toBe(
      "Esa no es la contraseña de tu cuenta.",
    );
  });

  it("401 sin indicación conserva el mensaje del API", () => {
    expect(authFailureMessage(new ApiError("Correo o contraseña incorrectos.", "http", 401))).toBe(
      "Correo o contraseña incorrectos.",
    );
  });

  it("400 conserva el mensaje del API (ya viene en español)", () => {
    expect(authFailureMessage(new ApiError("El correo no es válido.", "http", 400))).toBe("El correo no es válido.");
  });

  it("red, timeout y parseo conservan el mensaje del cliente HTTP", () => {
    expect(authFailureMessage(new ApiError("Sin conexión.", "network"))).toBe("Sin conexión.");
    expect(authFailureMessage(new ApiError("Tardó demasiado.", "timeout"))).toBe("Tardó demasiado.");
  });

  it("un error que no es de la API cae al genérico", () => {
    expect(authFailureMessage(new Error("boom"))).toBe("Ocurrió un error inesperado.");
    expect(authFailureMessage("boom")).toBe("Ocurrió un error inesperado.");
  });
});

describe("isUnverifiedFailure", () => {
  it("solo el 403 HTTP significa correo sin verificar", () => {
    expect(isUnverifiedFailure(new ApiError("Activa tu cuenta…", "http", 403))).toBe(true);
    expect(isUnverifiedFailure(new ApiError("x", "http", 401))).toBe(false);
    expect(isUnverifiedFailure(new ApiError("x", "network", 0))).toBe(false);
    expect(isUnverifiedFailure(new Error("403"))).toBe(false);
  });
});
