import type { Request, Response } from "express";
import { OrderStatus } from "@gira/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  listAdminOrders,
  getAdminOrder,
  changeOrderStatus,
  requestRefund,
} from "../services/adminOrderService.js";
import { getOrderStats } from "../services/orderStatsService.js";

/**
 * Admin order controllers — orchestrate req/res only, never touch models.
 */

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listAdminOrders(req.query);
  sendResponse(res, 200, "Órdenes obtenidas correctamente.", { orders: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const order = await getAdminOrder(req.params.id as string);
  sendResponse(res, 200, "Orden obtenida correctamente.", { order });
});

const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: OrderStatus };
  const order = await changeOrderStatus(req.params.id as string, status, buildContext(req));
  sendResponse(res, 200, "Estado de la orden actualizado correctamente.", { order });
});

const refund = asyncHandler(async (req: Request, res: Response) => {
  const order = await requestRefund(req.params.id as string, buildContext(req));
  sendResponse(res, 200, "Reembolso solicitado correctamente.", { order });
});

const stats = asyncHandler(async (req: Request, res: Response) => {
  const data = await getOrderStats(req.query);
  sendResponse(res, 200, "Estadísticas de órdenes obtenidas correctamente.", data);
});

export { list, detail, updateStatus, refund, stats };
