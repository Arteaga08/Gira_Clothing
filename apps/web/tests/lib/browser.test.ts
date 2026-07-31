import { describe, expect, it } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { login, logout } from "@/lib/api/auth";
import { jsonResponse, stubFetch } from "../helpers/fetchMock";

describe("browserRequest (ejercitado vía login/logout)", () => {
  it("toda llamada del navegador lleva credentials: include", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { user: { id: "1" } } }),
    );

    await login({ email: "a@b.com", password: "secret" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
  });

  it("login sin code omite la clave del body (el Joi del API tolera ausencia, no basura)", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { user: { id: "1" } } }),
    );

    await login({ email: "a@b.com", password: "secret" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("code");
  });

  it("login con code lo incluye en el body", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { user: { id: "1" } } }),
    );

    await login({ email: "a@b.com", password: "secret", code: "123456" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.code).toBe("123456");
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
