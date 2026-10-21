import { beforeEach, describe, expect, it, vi } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { customerClient } from "@/lib/api/adminCustomers";

const browser = vi.hoisted(() => ({ browserRequest: vi.fn() }));
vi.mock("@/lib/api/browser", () => browser);

const ID = "68f2ab12c3d4e5f6a7b8caa1";
const ok = (data: unknown, meta?: unknown) => ({ message: "ok", data, meta });

beforeEach(() => {
  browser.browserRequest.mockReset();
});

describe("customerClient", () => {
  it("top llama a /admin/customers/top con la consulta", async () => {
    browser.browserRequest.mockResolvedValue(
      ok({ ranking: { period: "month", sortBy: "spent", from: "x", to: "y", rows: [] } }),
    );
    const ranking = await customerClient.top("period=month&sortBy=spent");
    expect(browser.browserRequest).toHaveBeenCalledWith("/admin/customers/top?period=month&sortBy=spent");
    expect(ranking.rows).toEqual([]);
  });

  it("list devuelve clientes aplanados y la paginación", async () => {
    browser.browserRequest.mockResolvedValue(
      ok(
        {
          customers: [
            {
              id: ID,
              firstName: "Ana",
              lastName: "P",
              email: "a@x.mx",
              emailVerified: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              stats: { orderCount: 1, spentMxn: 100, lastOrderAt: null },
            },
          ],
        },
        { total: 1, page: 1, pages: 1, limit: 20 },
      ),
    );
    const { items, meta } = await customerClient.list("page=1&limit=20");
    expect(items[0]).toMatchObject({ orderCount: 1, spentMxn: 100 });
    expect(meta.total).toBe(1);
  });

  it("rechaza un id mal formado antes de pedir nada", async () => {
    const failure = await customerClient.get("zzz").catch((error: unknown) => error);
    expect(isApiError(failure)).toBe(true);
    expect((failure as Error).message).toBe("El identificador del cliente no es válido.");
    expect(browser.browserRequest).not.toHaveBeenCalled();
  });

  it("giveCoupon hace POST y devuelve cupón y emailSent", async () => {
    browser.browserRequest.mockResolvedValue(
      ok({
        coupon: {
          id: ID,
          code: "GRACIAS-ANA",
          name: "n",
          kind: "personal",
          discountType: "percent",
          percentOff: 15,
          minSubtotalMxn: 0,
          redeemedCount: 0,
          isActive: true,
          status: "active",
          createdAt: "",
          updatedAt: "",
        },
        emailSent: false,
      }),
    );
    const result = await customerClient.giveCoupon(ID, { code: "GRACIAS-ANA", discountType: "percent", percentOff: 15 });
    expect(browser.browserRequest).toHaveBeenCalledWith(`/admin/customers/${ID}/coupons`, {
      method: "POST",
      body: { code: "GRACIAS-ANA", discountType: "percent", percentOff: 15 },
    });
    expect(result).toMatchObject({ emailSent: false, coupon: { code: "GRACIAS-ANA" } });
  });
});
