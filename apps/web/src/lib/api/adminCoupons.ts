import type { ApiMeta } from "@gira/shared";
import { isObjectId } from "@/lib/inventory/variantId";
import type { CreateCouponBody, UpdateCouponBody } from "@/lib/coupons/couponForm";
import { toPanelCoupon, type PanelCoupon } from "@/lib/coupons/panelCoupon";
import { ApiError } from "./ApiError";
import { browserRequest } from "./browser";
import { ADMIN_COUPONS_PATH } from "./paths";
import { expectData, type ApiResult } from "./request";

/**
 * Browser-side client for /admin/coupons. Everything goes through
 * `browserRequest`: the list refreshes in the client and every mutation must
 * leave with a real Origin header (see browser.ts).
 */

interface CouponClient {
  list: (query: string) => Promise<{ items: PanelCoupon[]; meta: ApiMeta }>;
  get: (id: string) => Promise<PanelCoupon>;
  create: (body: CreateCouponBody) => Promise<PanelCoupon>;
  update: (id: string, body: UpdateCouponBody) => Promise<PanelCoupon>;
  /** Soft delete: orders that already used the coupon keep their frozen snapshot. */
  retire: (id: string) => Promise<PanelCoupon>;
  reactivate: (id: string) => Promise<PanelCoupon>;
}

/** A manipulated URL or id never reaches the API: it fails here, before any request. */
const assertCouponId = (value: string): string => {
  if (!isObjectId(value)) throw new ApiError("El identificador del cupón no es válido.", "parse");
  return value;
};

const itemPath = (id: string): string => `${ADMIN_COUPONS_PATH}/${assertCouponId(id)}`;

const item = async (call: Promise<ApiResult<{ coupon: Parameters<typeof toPanelCoupon>[0] }>>): Promise<PanelCoupon> =>
  toPanelCoupon(expectData(await call).coupon);

const couponClient: CouponClient = {
  list: async (query) => {
    const result = await browserRequest<{ coupons: Parameters<typeof toPanelCoupon>[0][] }>(
      `${ADMIN_COUPONS_PATH}?${query}`,
    );
    const coupons = expectData(result).coupons ?? [];
    return {
      items: coupons.map(toPanelCoupon),
      meta: result.meta ?? { total: coupons.length, page: 1, pages: 1, limit: coupons.length },
    };
  },
  get: async (id) => item(browserRequest(itemPath(id))),
  create: (body) => item(browserRequest(ADMIN_COUPONS_PATH, { method: "POST", body })),
  update: async (id, body) => item(browserRequest(itemPath(id), { method: "PATCH", body })),
  retire: async (id) => item(browserRequest(itemPath(id), { method: "DELETE" })),
  reactivate: async (id) => item(browserRequest(itemPath(id), { method: "PATCH", body: { isActive: true } })),
};

export { couponClient };
export type { CouponClient };
