import { describe, expect, it, vi } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { fetchOutboxHealth } from "@/lib/api/outbox";
import { getOutboxHealth, getOverview, getTimeseries } from "@/lib/api/stats";
import { jsonResponse, stubFetch } from "../helpers/fetchMock";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));

const withCookie = () => {
  cookiesMock.mockResolvedValue({
    get: (name: string) => (name === "gira_session" ? { name, value: "abc" } : undefined),
  });
};

describe("getOverview (servidor)", () => {
  it("pega a /admin/stats/overview con ?days=", async () => {
    withCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { orders: {}, inventory: {} } }),
    );

    await getOverview(7);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://api.test/api/v1/admin/stats/overview?days=7");
  });

  it("reenvía la cookie de sesión y cache: no-store", async () => {
    withCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { orders: {}, inventory: {} } }),
    );

    await getOverview(30);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).cookie).toBe("gira_session=abc");
    expect(init.cache).toBe("no-store");
  });

  it("desempaqueta data directo, sin llave nombrada", async () => {
    withCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "success",
        message: "ok",
        data: { orders: { period: { totalOrders: 47 } }, inventory: { activeVariants: 12 } },
      }),
    );

    const result = await getOverview(30);

    expect(result.orders.period.totalOrders).toBe(47);
    expect(result.inventory.activeVariants).toBe(12);
  });

  it("un 401 propaga ApiError sin tragarlo", async () => {
    withCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { status: "fail", message: "No has iniciado sesión." }));

    const error = await getOverview(30).catch((caught: unknown) => caught);

    expect(isApiError(error)).toBe(true);
    expect((error as { status: number }).status).toBe(401);
  });

  it("una respuesta sin data lanza ApiError kind: parse", async () => {
    withCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "success", message: "ok" }));

    const error = await getOverview(30).catch((caught: unknown) => caught);

    expect(isApiError(error)).toBe(true);
    expect((error as { kind: string }).kind).toBe("parse");
  });
});

describe("getTimeseries (servidor)", () => {
  it("pega a /admin/stats/timeseries con ?days=", async () => {
    withCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "success",
        message: "ok",
        data: { range: {}, granularity: "day", series: [] },
      }),
    );

    await getTimeseries(90);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://api.test/api/v1/admin/stats/timeseries?days=90");
  });
});

describe("getOutboxHealth (servidor)", () => {
  it("pega a /admin/notifications/health sin query", async () => {
    withCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "success",
        message: "ok",
        data: { pending: 0, sending: 0, failed: 0, sent: 0, stale: 0, oldestPendingAt: null, failedSample: [] },
      }),
    );

    await getOutboxHealth();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://api.test/api/v1/admin/notifications/health");
  });
});

describe("fetchOutboxHealth (navegador)", () => {
  it("lleva credentials: include", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "success",
        message: "ok",
        data: { pending: 1, sending: 0, failed: 0, sent: 0, stale: 0, oldestPendingAt: null, failedSample: [] },
      }),
    );

    await fetchOutboxHealth();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
  });
});
