import { beforeEach, describe, expect, it, vi } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { categoryClient, familyClient } from "@/lib/api/adminTaxonomy";

const browser = vi.hoisted(() => ({ browserRequest: vi.fn() }));
vi.mock("@/lib/api/browser", () => browser);

const ID = "68f2ab12c3d4e5f6a7b8c9e2";
const FAMILY = {
  id: ID,
  name: "Florales",
  slug: "florales",
  isActive: true,
  printCount: 2,
  activePrintCount: 1,
  activePrints: [{ id: "p1", name: "Peonía" }],
  updatedAt: "2026-10-20T00:00:00.000Z",
};
const CATEGORY = {
  id: ID,
  name: "Bolsas",
  slug: "bolsas",
  isActive: true,
  productCount: 1,
  activeProductCount: 1,
  activeProducts: [{ id: "m1", name: "Neceser" }],
  updatedAt: "2026-10-20T00:00:00.000Z",
};
const ok = (data: unknown, meta?: unknown) => ({ message: "ok", data, meta });

beforeEach(() => {
  browser.browserRequest.mockReset();
});

describe("familyClient", () => {
  it("list recorta los datos y trae el meta", async () => {
    const meta = { total: 1, page: 1, pages: 1, limit: 24 };
    browser.browserRequest.mockResolvedValue(ok({ families: [FAMILY] }, meta));
    const result = await familyClient.list("page=1");
    expect(browser.browserRequest).toHaveBeenCalledWith("/admin/print-families?page=1");
    expect(result.meta).toEqual(meta);
    expect(result.items[0]).toMatchObject({ id: ID, childCount: 2, activeChildren: [{ id: "p1", name: "Peonía" }] });
    expect(result.items[0]).not.toHaveProperty("slug");
  });

  it("list sin meta lo arma con lo recibido", async () => {
    browser.browserRequest.mockResolvedValue(ok({ families: [FAMILY] }));
    expect((await familyClient.list("")).meta).toEqual({ total: 1, page: 1, pages: 1, limit: 1 });
  });

  it("get, create, update, retire y reactivate usan el método y la ruta correctos", async () => {
    browser.browserRequest.mockResolvedValue(ok({ family: FAMILY }));
    await familyClient.get(ID);
    expect(browser.browserRequest).toHaveBeenLastCalledWith(`/admin/print-families/${ID}`);
    await familyClient.create({ name: "Florales" });
    expect(browser.browserRequest).toHaveBeenLastCalledWith("/admin/print-families", {
      method: "POST",
      body: { name: "Florales" },
    });
    await familyClient.update(ID, { name: "X" });
    expect(browser.browserRequest).toHaveBeenLastCalledWith(`/admin/print-families/${ID}`, {
      method: "PATCH",
      body: { name: "X" },
    });
    await familyClient.retire(ID);
    expect(browser.browserRequest).toHaveBeenLastCalledWith(`/admin/print-families/${ID}`, { method: "DELETE" });
    await familyClient.reactivate(ID);
    expect(browser.browserRequest).toHaveBeenLastCalledWith(`/admin/print-families/${ID}`, {
      method: "PATCH",
      body: { isActive: true },
    });
  });

  it("un id inválido falla antes de pedir nada", () => {
    expect(() => familyClient.get("../x")).toThrow();
    try {
      familyClient.retire("x");
    } catch (failure) {
      expect(isApiError(failure)).toBe(true);
    }
    expect(browser.browserRequest).not.toHaveBeenCalled();
  });
});

describe("categoryClient", () => {
  it("lee categories/category y mapea los modelos como hijos", async () => {
    browser.browserRequest.mockResolvedValue(ok({ categories: [CATEGORY] }, { total: 1, page: 1, pages: 1, limit: 24 }));
    const result = await categoryClient.list("");
    expect(browser.browserRequest).toHaveBeenCalledWith("/admin/product-categories?");
    expect(result.items[0]).toMatchObject({ childCount: 1, activeChildren: [{ id: "m1", name: "Neceser" }] });

    browser.browserRequest.mockResolvedValue(ok({ category: CATEGORY }));
    expect((await categoryClient.get(ID)).name).toBe("Bolsas");
  });
});
