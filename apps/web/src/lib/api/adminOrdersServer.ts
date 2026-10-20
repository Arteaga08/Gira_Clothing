import type { AdminOrder } from "@gira/shared";
import { assertOrderId } from "@/lib/orders/orderId";
import { toPanelOrder, type PanelOrder } from "@/lib/orders/panelOrder";
import { ADMIN_ORDERS_PATH } from "./paths";
import { expectData } from "./request";
import { serverRequest } from "./server";

/**
 * Server-only read of one order for the detail page. GET only, cookie
 * forwarded by `serverRequest`. The result is a `PanelOrder`: the credential
 * and internal ids are dropped here, before anything is handed to a Client
 * Component (whose props are serialized into the page).
 */
const getOrder = async (id: string): Promise<PanelOrder> =>
  toPanelOrder(expectData(await serverRequest<{ order: AdminOrder }>(`${ADMIN_ORDERS_PATH}/${assertOrderId(id)}`)).order);

export { getOrder };
