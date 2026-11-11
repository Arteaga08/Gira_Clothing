import type { OrderStatus, PublicOrder } from "@gira/shared";
import type { CheckoutPreviewRequest, CheckoutSummary, CreateCartOrderRequest, CreatedOrder, CustomerOrder, Wire } from "@gira/shared";
import { ApiError } from "./ApiError";
import { assertOrderId } from "@/lib/orders/orderId";
import { browserRequest } from "./browser";
import { MY_ORDERS_PATH, ORDERS_PATH, ORDERS_PREVIEW_PATH } from "./paths";
import { expectData } from "./request";

/** What the checkout would charge right now (the same chain as the order, without side effects). */
const previewOrder = async (body: CheckoutPreviewRequest): Promise<Wire<CheckoutSummary>> =>
  expectData(await browserRequest<{ summary: CheckoutSummary }>(ORDERS_PREVIEW_PATH, { method: "POST", body })).summary;

/**
 * Creates the order from the account's cart and reserves its stock. The key makes a retry return the
 * same order instead of a second one.
 */
const createOrder = async (body: CreateCartOrderRequest, idempotencyKey: string): Promise<Wire<CreatedOrder>> =>
  expectData(
    await browserRequest<CreatedOrder>(ORDERS_PATH, {
      method: "POST",
      body,
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  );

/** The secret of a pending order's own payment intent, to pay it again from «Mis pedidos». */
const payMyOrder = async (id: string): Promise<Wire<CreatedOrder>> =>
  expectData(await browserRequest<CreatedOrder>(`${MY_ORDERS_PATH}/${assertOrderId(id)}/payment`, { method: "POST" }));

const cancelMyOrder = async (id: string): Promise<Wire<CustomerOrder>> =>
  expectData(await browserRequest<{ order: CustomerOrder }>(`${MY_ORDERS_PATH}/${assertOrderId(id)}/cancel`, { method: "POST" })).order;

/** The customer's one pending order, if any (the API allows a single one at a time). */
const findPendingOrder = async (): Promise<Wire<CustomerOrder> | null> => {
  const { orders } = expectData(
    await browserRequest<{ orders: CustomerOrder[] }>(`${MY_ORDERS_PATH}?status=pending_payment&limit=1`),
  );
  return orders[0] ?? null;
};

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{43,64}$/;

/** Current status of an order by its public id (the one in the email links). Read-only: it never says «paid» by itself. */
const fetchPublicOrderStatus = async (publicId: string): Promise<OrderStatus> => {
  if (!PUBLIC_ID_PATTERN.test(publicId)) throw new ApiError("El identificador de la orden no es válido.", "parse");
  const { order } = expectData(await browserRequest<{ order: PublicOrder }>(`${ORDERS_PATH}/${publicId}`));
  return order.status;
};

export { fetchPublicOrderStatus, previewOrder, createOrder, payMyOrder, cancelMyOrder, findPendingOrder };
