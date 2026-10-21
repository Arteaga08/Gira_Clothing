import { beforeEach, describe, expect, it, vi } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import {
  createAdminPrint,
  getPrint,
  listPrints,
  reactivatePrint,
  retirePrint,
  updateAdminPrint,
} from "@/lib/api/adminPrints";

const browser = vi.hoisted(() => ({ browserRequest: vi.fn() }));
vi.mock("@/lib/api/browser", () => browser);

const ID = "68f2ab12c3d4e5f6a7b8c9e2";
const IMAGE = { url: "https://cdn/x.jpg", publicId: "gira/x", width: 1, height: 1 };
const RAW = {
  id: ID,
  name: "Rosas",
  slug: "rosas",
  sku: "FLR-001",
  family: { id: "f1", name: "Florales", slug: "florales" },
  image: IMAGE,
  isActive: true,
  variantCount: 1,
  activeVariantCount: 1,
  activeProducts: [{ id: "m1", name: "Neceser" }],
  updatedAt: "2026-10-20T00:00:00.000Z",
};
const ok = (data: unknown, meta?: unknown) => ({ message: "ok", data, meta });

beforeEach(() => {
  browser.browserRequest.mockReset();
});

describe("adminPrints", () => {
  it("listPrints recorta los datos y trae el meta", async () => {
    const meta = { total: 1, page: 1, pages: 1, limit: 24 };
    browser.browserRequest.mockResolvedValue(ok({ prints: [RAW] }, meta));
    const result = await listPrints("page=1");
    expect(browser.browserRequest).toHaveBeenCalledWith("/admin/prints?page=1");
    expect(result.meta).toEqual(meta);
    expect(result.prints[0]).toMatchObject({ id: ID, imageUrl: IMAGE.url });
    expect(result.prints[0]).not.toHaveProperty("slug");
  });

  it("getPrint pide una estampa", async () => {
    browser.browserRequest.mockResolvedValue(ok({ print: RAW }));
    expect((await getPrint(ID)).name).toBe("Rosas");
    expect(browser.browserRequest).toHaveBeenCalledWith(`/admin/prints/${ID}`);
  });

  it("createAdminPrint hace POST con el cuerpo", async () => {
    browser.browserRequest.mockResolvedValue(ok({ print: RAW }));
    const body = { name: "Rosas", sku: "FLR-001", family: "f1", image: IMAGE };
    await createAdminPrint(body);
    expect(browser.browserRequest).toHaveBeenCalledWith("/admin/prints", { method: "POST", body });
  });

  it("updateAdminPrint, retirePrint y reactivatePrint usan PATCH / DELETE / PATCH", async () => {
    browser.browserRequest.mockResolvedValue(ok({ print: RAW }));
    await updateAdminPrint(ID, { name: "Otro" });
    expect(browser.browserRequest).toHaveBeenLastCalledWith(`/admin/prints/${ID}`, { method: "PATCH", body: { name: "Otro" } });
    await retirePrint(ID);
    expect(browser.browserRequest).toHaveBeenLastCalledWith(`/admin/prints/${ID}`, { method: "DELETE" });
    await reactivatePrint(ID);
    expect(browser.browserRequest).toHaveBeenLastCalledWith(`/admin/prints/${ID}`, { method: "PATCH", body: { isActive: true } });
  });

  it("un id roto no sale a la red", async () => {
    await expect(getPrint("../x")).rejects.toSatisfy(isApiError);
    await expect(retirePrint("zzz")).rejects.toSatisfy(isApiError);
    expect(browser.browserRequest).not.toHaveBeenCalled();
  });
});
