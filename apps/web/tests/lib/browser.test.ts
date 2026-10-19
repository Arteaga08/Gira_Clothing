import { describe, expect, it } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { completeEnrollment, login, logout, startEnrollment, verifyTwoFactor } from "@/lib/api/auth";
import { jsonResponse, stubFetch } from "../helpers/fetchMock";

describe("browserRequest (ejercitado vía login/logout)", () => {
  it("toda llamada del navegador lleva credentials: include", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { status: "two_factor_required" } }),
    );

    await login({ email: "a@b.com", password: "secret" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
  });

  it("login manda solo correo y contraseña: el código viaja aparte, nunca con la contraseña", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { status: "two_factor_required" } }),
    );

    const result = await login({ email: "a@b.com", password: "secret" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.com", password: "secret" });
    expect(result).toEqual({ status: "two_factor_required" });
  });

  it("verifyTwoFactor envía solo el código a /auth/2fa/verify y devuelve el usuario", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "success",
        message: "ok",
        data: { status: "authenticated", user: { id: "1" } },
      }),
    );

    await verifyTwoFactor("123456");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/2fa/verify");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ code: "123456" });
  });

  it("startEnrollment pide el QR a /auth/2fa/enroll/start", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "success",
        message: "ok",
        data: { qrDataUrl: "data:image/png;base64,AAAA", manualKey: "ABCD" },
      }),
    );

    const result = await startEnrollment();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/2fa/enroll/start");
    expect(init.method).toBe("POST");
    expect(result).toEqual({ qrDataUrl: "data:image/png;base64,AAAA", manualKey: "ABCD" });
  });

  it("completeEnrollment envía el código a /auth/2fa/enroll/complete", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "success",
        message: "ok",
        data: { status: "authenticated", user: { id: "1" } },
      }),
    );

    await completeEnrollment("654321");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/2fa/enroll/complete");
    expect(JSON.parse(init.body as string)).toEqual({ code: "654321" });
  });

  it("logout traga un 401 (la sesión ya no existía) y resuelve", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { status: "fail", message: "No has iniciado sesión." }),
    );

    await expect(logout()).resolves.toBeUndefined();
  });

  it("logout propaga un error distinto de 401", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { status: "error", message: "Algo falló." }));

    const error = await logout().catch((caught: unknown) => caught);
    expect(isApiError(error)).toBe(true);
  });
});
