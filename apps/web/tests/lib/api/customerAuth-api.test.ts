import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import {
  forgotPassword,
  logoutAll,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "@/lib/api/auth";
import { jsonResponse, stubFetch } from "../../helpers/fetchMock";

const ok = jsonResponse(200, { status: "success", message: "ok" });
const callOf = (fetchMock: ReturnType<typeof stubFetch>) => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, body: init.body ? (JSON.parse(init.body as string) as unknown) : undefined };
};

describe("cuentas de cliente", () => {
  it("register: POST /auth/register con los cuatro campos, sin rol", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { status: "success", message: "ok" }));

    await register({ firstName: "María", lastName: "López", email: "m@correo.mx", password: "Gira2026xyz" });

    const { url, init, body } = callOf(fetchMock);
    expect(url).toBe("http://api.test/api/v1/auth/register");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(body).toEqual({ firstName: "María", lastName: "López", email: "m@correo.mx", password: "Gira2026xyz" });
  });

  it("verifyEmail: token + contraseña", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok);
    await verifyEmail({ token: "a".repeat(64), password: "Gira2026xyz" });
    const { url, body } = callOf(fetchMock);
    expect(url).toMatch(/\/auth\/verify-email$/);
    expect(body).toEqual({ token: "a".repeat(64), password: "Gira2026xyz" });
  });

  it("resendVerification y forgotPassword: solo el correo", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(ok);
    await resendVerification("m@correo.mx");
    await forgotPassword("m@correo.mx");
    const urls = fetchMock.mock.calls.map(([url]) => url as string);
    expect(urls[0]).toMatch(/\/auth\/resend-verification$/);
    expect(urls[1]).toMatch(/\/auth\/forgot-password$/);
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(JSON.parse(init.body as string)).toEqual({ email: "m@correo.mx" });
    }
  });

  it("resetPassword: token + contraseña nueva", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok);
    await resetPassword({ token: "b".repeat(64), password: "Nueva2026xyz" });
    const { url, body } = callOf(fetchMock);
    expect(url).toMatch(/\/auth\/reset-password$/);
    expect(body).toEqual({ token: "b".repeat(64), password: "Nueva2026xyz" });
  });

  it("logoutAll: POST /auth/logout-all y un 401 cuenta como ya cerrada", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok);
    await logoutAll();
    expect(callOf(fetchMock).url).toMatch(/\/auth\/logout-all$/);

    fetchMock.mockResolvedValueOnce(jsonResponse(401, { status: "fail", message: "No autorizado" }));
    await expect(logoutAll()).resolves.toBeUndefined();
  });

  it("un 429 sube como ApiError para que la pantalla lo traduzca", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { status: "fail", message: "Demasiadas solicitudes" }));
    await expect(forgotPassword("m@correo.mx")).rejects.toBeInstanceOf(ApiError);
  });
});
