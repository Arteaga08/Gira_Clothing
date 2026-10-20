import { describe, expect, it, vi } from "vitest";
import { getInventoryCounts } from "@/lib/api/adminVariantsServer";
import { fetchInventoryCounts, getVariantActivity, listVariants, updateStock } from "@/lib/api/adminVariants";
import { jsonResponse, stubFetch } from "../helpers/fetchMock";
import { IMAGE_PUBLIC_ID_SENTINEL, SLUG_SENTINEL, makeRawVariant } from "../helpers/inventory";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));

const ID = "68f2ab12c3d4e5f6a7b8c9d0";
const BASE = "http://api.test/api/v1/admin/variants";

const ok = (data?: unknown, meta?: unknown) =>
  jsonResponse(200, { status: "success", message: "ok", ...(data === undefined ? {} : { data }), ...(meta ? { meta } : {}) });
const callOf = (mock: ReturnType<typeof stubFetch>) => mock.mock.calls[0] as [string, RequestInit];

const STATS = {
  lowStockThreshold: 3,
  activeVariants: 10,
  outOfStock: 2,
  lowStock: 3,
  unitsOnHand: 99,
  unitsReserved: 4,
  unitsAvailable: 95,
  lowStockItems: [{ id: ID, sku: "X", productName: "Y", available: 0 }],
};

describe("listVariants", () => {
  it("pega a /admin/variants con el query y recorta cada fila", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ variants: [makeRawVariant()] }, { total: 1, page: 1, pages: 1, limit: 100 }));

    const result = await listVariants("isActive=true&page=1");

    const [url, init] = callOf(fetchMock);
    expect(url).toBe(`${BASE}?isActive=true&page=1`);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(result.variants).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    const serialized = JSON.stringify(result.variants);
    expect(serialized).not.toContain(SLUG_SENTINEL);
    expect(serialized).not.toContain(IMAGE_PUBLIC_ID_SENTINEL);
  });

  it("sin meta inventa una página única", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ variants: [makeRawVariant()] }));
    expect((await listVariants("")).meta).toEqual({ total: 1, page: 1, pages: 1, limit: 1 });
  });
});

describe("conteos", () => {
  it("fetchInventoryCounts reduce las estadísticas a lo que usa el panel", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok(STATS));
    expect(await fetchInventoryCounts()).toEqual({ threshold: 3, total: 10, out: 2, low: 3, ok: 5 });
    expect(callOf(fetchMock)[0]).toBe(`${BASE}/stats`);
  });

  it("getInventoryCounts (servidor) hace lo mismo reenviando la cookie", async () => {
    cookiesMock.mockResolvedValue({ get: (name: string) => (name === "gira_session" ? { name, value: "abc" } : undefined) });
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok(STATS));
    expect(await getInventoryCounts()).toMatchObject({ threshold: 3, out: 2, low: 3, ok: 5 });
    expect(callOf(fetchMock)[0]).toBe(`${BASE}/stats`);
  });
});

describe("updateStock", () => {
  it("recuento: PATCH /stock con onHand y motivo, devuelve la fila recortada", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ variant: makeRawVariant({ onHand: 12, available: 10 }) }));

    const variant = await updateStock(ID, { onHand: 12, reason: "Conteo" });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe(`${BASE}/${ID}/stock`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ onHand: 12, reason: "Conteo" });
    expect(variant.onHand).toBe(12);
    expect(JSON.stringify(variant)).not.toContain(SLUG_SENTINEL);
  });

  it("movimiento: manda delta", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ variant: makeRawVariant() }));
    await updateStock(ID, { delta: -2 });
    expect(JSON.parse(String(callOf(fetchMock)[1].body))).toEqual({ delta: -2 });
  });

  it("un id manipulado ni siquiera sale del navegador", async () => {
    const fetchMock = stubFetch();
    await expect(updateStock("../orders", { delta: 1 })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getVariantActivity", () => {
  it("desempaqueta data.activity", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ activity: [{ id: "1", action: "stock_set" }] }));
    expect(await getVariantActivity(ID)).toHaveLength(1);
    expect(callOf(fetchMock)[0]).toBe(`${BASE}/${ID}/activity`);
  });

  it("valida el id antes de pedir", async () => {
    const fetchMock = stubFetch();
    await expect(getVariantActivity("x")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
