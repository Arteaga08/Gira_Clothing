import type { AccountProfile, ApiMeta, CustomerOrder, Wire } from "@gira/shared";
import { isApiError } from "./ApiError";
import { expectData } from "./request";
import { serverRequest } from "./server";
import { ACCOUNT_PATH, MY_ORDERS_PATH } from "./paths";
import { assertOrderId } from "@/lib/orders/orderId";

/**
 * Server-side reads for «Mi cuenta». Like the wishlist's, a failure is a state the page
 * draws, never an exception; a missing order is its own state so the page can answer 404.
 */

const ORDERS_PAGE_SIZE = 10;
const TIMEOUT_MS = 5_000;

type AccountResult = { status: "ok"; profile: Wire<AccountProfile> } | { status: "error" };

type MyOrdersResult =
  | { status: "ok"; orders: Wire<CustomerOrder>[]; meta: ApiMeta }
  | { status: "error" };

type MyOrderResult = { status: "ok"; order: Wire<CustomerOrder> } | { status: "not-found" } | { status: "error" };

const getAccountProfile = async (): Promise<AccountResult> => {
  try {
    const { profile } = expectData(await serverRequest<{ profile: AccountProfile }>(ACCOUNT_PATH, { timeoutMs: TIMEOUT_MS }));
    return { status: "ok", profile };
  } catch {
    return { status: "error" };
  }
};

const getMyOrders = async (page: number, limit: number = ORDERS_PAGE_SIZE): Promise<MyOrdersResult> => {
  try {
    const result = await serverRequest<{ orders: CustomerOrder[] }>(`${MY_ORDERS_PATH}?page=${String(page)}&limit=${String(limit)}`, {
      timeoutMs: TIMEOUT_MS,
    });
    const meta = result.meta ?? { total: 0, page, pages: 1, limit };
    return { status: "ok", orders: expectData(result).orders, meta };
  } catch {
    return { status: "error" };
  }
};

const getMyOrder = async (id: string): Promise<MyOrderResult> => {
  try {
    const { order } = expectData(
      await serverRequest<{ order: CustomerOrder }>(`${MY_ORDERS_PATH}/${assertOrderId(id)}`, { timeoutMs: TIMEOUT_MS }),
    );
    return { status: "ok", order };
  } catch (error) {
    if (isApiError(error) && error.kind === "http" && error.status === 404) return { status: "not-found" };
    return { status: "error" };
  }
};

export type { AccountResult, MyOrdersResult, MyOrderResult };
export { ORDERS_PAGE_SIZE, getAccountProfile, getMyOrders, getMyOrder };
