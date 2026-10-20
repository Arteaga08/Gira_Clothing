import type { Request, Response } from "express";
import type { OrderPriority, OrderStatus, ShippingAddress } from "@gira/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  listAdminOrders,
  getOrderSummary,
  getAdminOrder,
  changeOrderStatus,
  requestRefund,
  getOrderActivity,
  updateOrderPriority,
  updateShippingAddress,
  bulkChangeStatus,
} from "../services/adminOrderService.js";
import { getOrderStats } from "../services/orderStatsService.js";
import { retryLabel } from "../services/shippingLabelService.js";

/**
 * Admin order controllers — orchestrate req/res only, never touch models.
 */

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listAdminOrders(req.query);
  sendResponse(res, 200, "Órdenes obtenidas correctamente.", { orders: items }, meta);
});

const summary = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getOrderSummary();
  sendResponse(res, 200, "Resumen de órdenes obtenido correctamente.", { summary: data });
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const order = await getAdminOrder(req.params.id as string);
  sendResponse(res, 200, "Orden obtenida correctamente.", { order });
});

const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, reason } = req.body as { status: OrderStatus; reason?: string };
  const order = await changeOrderStatus(req.params.id as string, status, buildContext(req), reason);
  sendResponse(res, 200, "Estado de la orden actualizado correctamente.", { order });
});

const updatePriority = asyncHandler(async (req: Request, res: Response) => {
  const { priority } = req.body as { priority: OrderPriority };
  const order = await updateOrderPriority(req.params.id as string, priority, buildContext(req));
  sendResponse(res, 200, "Prioridad de la orden actualizada correctamente.", { order });
});

const updateAddress = asyncHandler(async (req: Request, res: Response) => {
  const address = req.body as ShippingAddress;
  const order = await updateShippingAddress(req.params.id as string, address, buildContext(req));
  sendResponse(res, 200, "Dirección de envío actualizada correctamente.", { order });
});

const retryOrderLabel = asyncHandler(async (req: Request, res: Response) => {
  await retryLabel(req.params.id as string, buildContext(req));
  sendResponse(res, 200, "Reintentamos generar la guía. Revisa el pedido en unos segundos.");
});

const bulkStatus = asyncHandler(async (req: Request, res: Response) => {
  const { ids, status } = req.body as { ids: string[]; status: OrderStatus };
  const result = await bulkChangeStatus(ids, status, buildContext(req));
  sendResponse(res, 200, "Lote procesado correctamente.", { result });
});

const refund = asyncHandler(async (req: Request, res: Response) => {
  const order = await requestRefund(req.params.id as string, buildContext(req));
  sendResponse(res, 200, "Reembolso solicitado correctamente.", { order });
});

const activity = asyncHandler(async (req: Request, res: Response) => {
  const entries = await getOrderActivity(req.params.id as string);
  sendResponse(res, 200, "Actividad de la orden obtenida correctamente.", { activity: entries });
});

const stats = asyncHandler(async (req: Request, res: Response) => {
  const data = await getOrderStats(req.query);
  sendResponse(res, 200, "Estadísticas de órdenes obtenidas correctamente.", data);
});

export {
  list,
  summary,
  detail,
  updateStatus,
  updatePriority,
  updateAddress,
  retryOrderLabel,
  bulkStatus,
  refund,
  activity,
  stats,
};
