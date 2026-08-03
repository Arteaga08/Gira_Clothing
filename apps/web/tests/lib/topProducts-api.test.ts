import { describe, expect, it, vi } from "vitest";
import { fetchTopProductsForPeriod } from "@/lib/api/topProducts";
import { getTopProductsForPeriod } from "@/lib/api/topProductsServer";
import { jsonResponse, stubFetch } from "../helpers/fetchMock";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));

const withCookie = () => {
  cookiesMock.mockResolvedValue({
    get: (name: string) => (name === "gira_session" ? { name, value: "abc" } : undefined),
  });
};

const okResponse = () =>
  jsonResponse(200, {
    status: "success",
    message: "ok",
    data: { period: "week", range: { from: "2026-07-27T06:00:00.000Z", to: "2026-08-03T00:00:00.000Z" }, products: [] },
  });

describe("getTopProductsForPeriod (servidor)", () => {
  it("period=today pega a /admin/stats/top-products?period=today", async () => {
    withCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(okResponse());

    await getTopProductsForPeriod("today");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://api.test/api/v1/admin/stats/top-products?period=today");
  });

  it("period=custom con fecha agrega &fecha=", async () => {
    withCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(okResponse());

    await getTopProductsForPeriod("custom", "2026-07-01");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://api.test/api/v1/admin/stats/top-products?period=custom&fecha=2026-07-01");
  });

  it("reenvía la cookie de sesión y cache: no-store", async () => {
    withCookie();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(okResponse());

    await getTopProductsForPeriod("week");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).cookie).toBe("gira_session=abc");
    expect(init.cache).toBe("no-store");
  });
});

describe("fetchTopProductsForPeriod (navegador)", () => {
  it("period=month pega a /admin/stats/top-products?period=month, con credentials: include", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(okResponse());

    await fetchTopProductsForPeriod("month");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/admin/stats/top-products?period=month");
    expect(init.credentials).toBe("include");
  });

  it("period=custom con fecha agrega &fecha=", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(okResponse());

    await fetchTopProductsForPeriod("custom", "2026-06-15");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://api.test/api/v1/admin/stats/top-products?period=custom&fecha=2026-06-15");
  });
});
