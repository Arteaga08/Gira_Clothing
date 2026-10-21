import type { AdminCustomer, ApiMeta, GiveCouponResult, TopCustomers, Wire } from "@gira/shared";
import { toPanelCoupon, type PanelCoupon } from "@/lib/coupons/panelCoupon";
import type { GiveCouponBody } from "@/lib/customers/giveCouponForm";
import { toPanelCustomer, type PanelCustomer } from "@/lib/customers/panelCustomer";
import { isObjectId } from "@/lib/inventory/variantId";
import { ApiError } from "./ApiError";
import { browserRequest } from "./browser";
import { ADMIN_CUSTOMERS_PATH } from "./paths";
import { expectData } from "./request";

/** Browser-side client for /admin/customers (reads refresh in the client; the POST needs a real Origin). */

interface CustomerClient {
  top: (query: string) => Promise<Wire<TopCustomers>>;
  list: (query: string) => Promise<{ items: PanelCustomer[]; meta: ApiMeta }>;
  get: (id: string) => Promise<PanelCustomer>;
  giveCoupon: (id: string, body: GiveCouponBody) => Promise<{ coupon: PanelCoupon; emailSent: boolean }>;
}

/** A manipulated URL or id never reaches the API: it fails here, before any request. */
const assertCustomerId = (value: string): string => {
  if (!isObjectId(value)) throw new ApiError("El identificador del cliente no es válido.", "parse");
  return value;
};

const customerClient: CustomerClient = {
  top: async (query) =>
    expectData(await browserRequest<{ ranking: Wire<TopCustomers> }>(`${ADMIN_CUSTOMERS_PATH}/top?${query}`)).ranking,
  list: async (query) => {
    const result = await browserRequest<{ customers: Wire<AdminCustomer>[] }>(`${ADMIN_CUSTOMERS_PATH}?${query}`);
    const customers = expectData(result).customers ?? [];
    return {
      items: customers.map(toPanelCustomer),
      meta: result.meta ?? { total: customers.length, page: 1, pages: 1, limit: customers.length },
    };
  },
  get: async (id) =>
    toPanelCustomer(
      expectData(await browserRequest<{ customer: Wire<AdminCustomer> }>(`${ADMIN_CUSTOMERS_PATH}/${assertCustomerId(id)}`))
        .customer,
    ),
  giveCoupon: async (id, body) => {
    const data = expectData(
      await browserRequest<Wire<GiveCouponResult>>(`${ADMIN_CUSTOMERS_PATH}/${assertCustomerId(id)}/coupons`, {
        method: "POST",
        body,
      }),
    );
    return { coupon: toPanelCoupon(data.coupon), emailSent: data.emailSent };
  },
};

export { customerClient };
export type { CustomerClient };
