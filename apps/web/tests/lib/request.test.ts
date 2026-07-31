import { describe, expect, it, vi } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { expectData, request } from "@/lib/api/request";
import { brokenJsonResponse, jsonResponse, networkFailure, stubFetch } from "../helpers/fetchMock";

describe("request", () => {
  it("apunta a la base URL configurada, sin // doble ni /api/v1 repetido", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "success", message: "ok" }));

    await request("/auth/me");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/auth/me",
      expect.anything(),
    );
  });

  it("un body en POST se serializa como JSON con el content-type correcto", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "success", message: "ok" }));

    await request("/auth/login", { method: "POST", body: { email: "a@b.com" } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ email: "a@b.com" }));
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("desempaqueta message/data/meta del envelope de éxito", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "success",
        message: "Usuario autenticado.",
        data: { user: { id: "1" } },
      }),
    );

    const result = await request<{ user: { id: string } }>("/auth/me");

    expect(result.message).toBe("Usuario autenticado.");
    expect(result.data).toEqual({ user: { id: "1" } });
    expect(result.meta).toBeUndefined();
  });

  it("propaga meta tal cual cuando el endpoint es un listado", async () => {
    const fetchMock = stubFetch();
    const meta = { total: 1, page: 1, pages: 1, limit: 20 };
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { orders: [] }, meta }),
    );

    const result = await request("/admin/orders");

    expect(result.meta).toEqual(meta);
  });

  it("una respuesta de éxito sin data no lanza y data queda undefined", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "Sesión cerrada correctamente." }),
    );

    const result = await request("/auth/logout", { method: "POST" });

    expect(result.data).toBeUndefined();
  });

  it("un error 4xx lanza ApiError con el status y el message del API", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        status: "fail",
        message: "Se requiere el código de verificación de dos factores.",
      }),
    );

    await expect(request("/auth/login", { method: "POST" })).rejects.toMatchObject({
      status: 401,
      kind: "http",
      message: "Se requiere el código de verificación de dos factores.",
    });
  });

  it("una respuesta de error sin JSON válido lanza ApiError kind:parse", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(brokenJsonResponse(500));

    const error = await request("/auth/me").catch((caught: unknown) => caught);

    expect(isApiError(error)).toBe(true);
    if (isApiError(error)) {
      expect(error.kind).toBe("parse");
    }
  });

  it("cuando fetch rechaza por falta de red, lanza ApiError kind:network", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockImplementationOnce(networkFailure);

    const error = await request("/auth/me").catch((caught: unknown) => caught);

    expect(isApiError(error)).toBe(true);
    if (isApiError(error)) {
      expect(error.kind).toBe("network");
    }
  });

  it("si el servidor no responde dentro del timeout, lanza ApiError kind:timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch();
    // Mimics real fetch: the request only settles when its own signal aborts.
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const pending = request("/auth/me", { timeoutMs: 10_000 }).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(10_001);
    const error = await pending;

    expect(isApiError(error)).toBe(true);
    if (isApiError(error)) {
      expect(error.kind).toBe("timeout");
    }
    vi.useRealTimers();
  });

  it("si el caller aborta la señal, el error es network, no timeout", async () => {
    const fetchMock = stubFetch();
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );

    const pending = request("/auth/me", { signal: controller.signal }).catch(
      (caught: unknown) => caught,
    );
    controller.abort();
    const error = await pending;

    expect(isApiError(error)).toBe(true);
    if (isApiError(error)) {
      expect(error.kind).toBe("network");
    }
  });

  it("expectData lanza ApiError kind:parse si el resultado no trae data", () => {
    expect(() => expectData({ message: "ok", data: undefined, meta: undefined })).toThrow();
    try {
      expectData({ message: "ok", data: undefined, meta: undefined });
    } catch (error) {
      expect(isApiError(error)).toBe(true);
      if (isApiError(error)) expect(error.kind).toBe("parse");
    }
  });

  it("expectData devuelve data cuando está presente", () => {
    const data = expectData({ message: "ok", data: { user: { id: "1" } }, meta: undefined });
    expect(data).toEqual({ user: { id: "1" } });
  });
});
