import type {
  AdminOrder,
  AdminOrderTracking,
  ApiMeta,
  BulkStatusResult,
  OrderActivityEntry,
  OrderPriority,
  OrderStatus,
  OrderSummary,
  ShippingAddress,
  Wire,
} from "@gira/shared";
import { assertOrderId } from "@/lib/orders/orderId";
import { toPanelOrder, type PanelOrder } from "@/lib/orders/panelOrder";
import { browserRequest } from "./browser";
import { ADMIN_ORDERS_PATH } from "./paths";
import { expectData } from "./request";

/**
 * Browser-side client for /admin/orders. Reads and writes both go through
 * `browserRequest`: the list refreshes in the client, and every mutation must
 * leave with a real Origin header (see browser.ts). The server-only read of a
 * single order lives in adminOrdersServer.ts.
 *
 * Order endpoints wrap their payload in a named key (`orders`, `order`,
 * `summary`...), unlike the stats endpoints.
 */


const orderPath = (id: string, suffix = ""): string => `${ADMIN_ORDERS_PATH}/${assertOrderId(id)}${suffix}`;

const listOrders = async (query: string): Promise<{ orders: PanelOrder[]; meta: ApiMeta }> => {
  const result = await browserRequest<{ orders: AdminOrder[] }>(`${ADMIN_ORDERS_PATH}?${query}`);
  const { orders } = expectData(result);
  return {
    orders: orders.map(toPanelOrder),
    meta: result.meta ?? { total: orders.length, page: 1, pages: 1, limit: orders.length },
  };
};

/** Browser re-read of one order, for after actions whose response carries no order (retrying a label). */
const fetchOrder = async (id: string): Promise<PanelOrder> =>
  toPanelOrder(expectData(await browserRequest<{ order: AdminOrder }>(orderPath(id))).order);

const getOrderSummary = async (): Promise<Wire<OrderSummary>> =>
  expectData(await browserRequest<{ summary: OrderSummary }>(`${ADMIN_ORDERS_PATH}/summary`)).summary;

const getOrderTracking = async (id: string): Promise<Wire<AdminOrderTracking>> =>
  expectData(await browserRequest<{ tracking: AdminOrderTracking }>(orderPath(id, "/tracking"))).tracking;

const getOrderActivity = async (id: string): Promise<Wire<OrderActivityEntry>[]> =>
  expectData(await browserRequest<{ activity: OrderActivityEntry[] }>(orderPath(id, "/activity"))).activity;

const sendOrderChange = async (path: string, method: "PATCH" | "POST", body?: unknown): Promise<PanelOrder> =>
  toPanelOrder(
    expectData(await browserRequest<{ order: AdminOrder }>(path, body === undefined ? { method } : { method, body }))
      .order,
  );

const updateOrderStatus = async (id: string, status: OrderStatus, reason?: string): Promise<PanelOrder> =>
  sendOrderChange(orderPath(id, "/status"), "PATCH", reason === undefined ? { status } : { status, reason });

const updateOrderPriority = async (id: string, priority: OrderPriority): Promise<PanelOrder> =>
  sendOrderChange(orderPath(id, "/priority"), "PATCH", { priority });

const updateShippingAddress = async (id: string, address: ShippingAddress): Promise<PanelOrder> =>
  sendOrderChange(orderPath(id, "/shipping-address"), "PATCH", address);

const markShipped = async (id: string): Promise<PanelOrder> => sendOrderChange(orderPath(id, "/ship"), "POST");

/** Always a full refund, with no body: the API decides the amount. */
const requestRefund = async (id: string): Promise<PanelOrder> => sendOrderChange(orderPath(id, "/refund"), "POST");

/** The API answers with a message and no data; the caller refreshes the order afterwards. */
const retryLabel = async (id: string): Promise<string> =>
  (await browserRequest<unknown>(orderPath(id, "/label/retry"), { method: "POST" })).message;

const bulkMarkProcessing = async (ids: readonly string[]): Promise<Wire<BulkStatusResult>> => {
  ids.forEach(assertOrderId);
  const result = await browserRequest<{ result: BulkStatusResult }>(`${ADMIN_ORDERS_PATH}/bulk-status`, {
    method: "PATCH",
    body: { ids, status: "processing" },
  });
  return expectData(result).result;
};

export {
  listOrders,
  fetchOrder,
  getOrderSummary,
  getOrderTracking,
  getOrderActivity,
  updateOrderStatus,
  updateOrderPriority,
  updateShippingAddress,
  markShipped,
  requestRefund,
  retryLabel,
  bulkMarkProcessing,
};
