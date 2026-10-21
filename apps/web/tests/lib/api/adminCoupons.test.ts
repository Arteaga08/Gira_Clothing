import { CouponDiscountType, CouponStatus } from "@gira/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { couponClient } from "@/lib/api/adminCoupons";

const browser = vi.hoisted(() => ({ browserRequest: vi.fn() }));
vi.mock("@/lib/api/browser", () => browser);

const ID = "68f2ab12c3d4e5f6a7b8caa1";
const COUPON = {
  id: ID,
  code: "VERANO10",
  name: "Verano",
  discountType: CouponDiscountType.PERCENT,
  percentOff: 10,
  minSubtotalMxn: 0,
  redeemedCount: 2,
  isActive: true,
  status: CouponStatus.ACTIVE,
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
};
const ok = (data: unknown, meta?: unknown) => ({ message: "ok", data, meta });

beforeEach(() => {
  browser.browserRequest.mockReset();
});

describe("couponClient", () => {
  it("list trae los cupones recortados y el meta", async () => {
    const meta = { total: 1, page: 1, pages: 1, limit: 20 };
    browser.browserRequest.mockResolvedValue(ok({ coupons: [COUPON] }, meta));
    const result = await couponClient.list("page=1");
    expect(browser.browserRequest).toHaveBeenCalledWith("/admin/coupons?page=1");
    expect(result.meta).toEqual(meta);
    expect(result.items[0]).toMatchObject({ id: ID, code: "VERANO10", redeemedCount: 2 });
    expect(result.items[0]).not.toHaveProperty("createdAt");
  });

  it("list sin meta lo arma con lo recibido", async () => {
    browser.browserRequest.mockResolvedValue(ok({ coupons: [COUPON] }));
    expect((await couponClient.list("")).meta).toEqual({ total: 1, page: 1, pages: 1, limit: 1 });
  });

  it("get, create, update, retire y reactivate usan el método y la ruta correctos", async () => {
    browser.browserRequest.mockResolvedValue(ok({ coupon: COUPON }));
    await couponClient.get(ID);
    expect(browser.browserRequest).toHaveBeenLastCalledWith(`/admin/coupons/${ID}`);
    await couponClient.create({ code: "VERANO10", name: "Verano", discountType: "percent", percentOff: 10 });
    expect(browser.browserRequest).toHaveBeenLastCalledWith("/admin/coupons", {
      method: "POST",
      body: { code: "VERANO10", name: "Verano", discountType: "percent", percentOff: 10 },
    });
    await couponClient.update(ID, { name: "X" });
    expect(browser.browserRequest).toHaveBeenLastCalledWith(`/admin/coupons/${ID}`, { method: "PATCH", body: { name: "X" } });
    await couponClient.retire(ID);
    expect(browser.browserRequest).toHaveBeenLastCalledWith(`/admin/coupons/${ID}`, { method: "DELETE" });
    await couponClient.reactivate(ID);
    expect(browser.browserRequest).toHaveBeenLastCalledWith(`/admin/coupons/${ID}`, {
      method: "PATCH",
      body: { isActive: true },
    });
  });

  it("un id manipulado falla antes de tocar la red", async () => {
    const failure = await couponClient.get("../../auth/logout").catch((error: unknown) => error);
    expect(isApiError(failure) && failure.kind === "parse").toBe(true);
    expect(browser.browserRequest).not.toHaveBeenCalled();
  });
});
