import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { AppError } from "../utils/AppError.js";
import { isValidIdempotencyKey } from "../utils/idempotency.js";
import {
  createOrder,
  getOrderByPublicId,
  listMyOrders,
  getMyOrder,
  type CreateOrderInput,
  type OrderContext,
} from "../services/orderService.js";
import { getPublicTracking } from "../services/shipmentService.js";

/**
 * Order controllers — orchestrate req/res only, never touch models.
 */

/**
 * A UUID is REQUIRED, not merely preferred: the key is one half of the guard
 * that keeps a replay from returning someone else's order (the other half is
 * the owner scoping in utils/idempotency.ts). A length check alone lets a
 * client pick "12345678" and collide on purpose.
 */
const requireIdempotencyKey = (req: Request): string => {
  const header = req.headers["idempotency-key"];
  const key = typeof header === "string" ? header.trim() : "";
  if (!isValidIdempotencyKey(key)) {
    throw new AppError(
      "Falta o es inválido el header Idempotency-Key: debe ser un UUID.",
      400,
    );
  }
  return key;
};

const create = asyncHandler(async (req: Request, res: Response) => {
  const idempotencyKey = requireIdempotencyKey(req);
  const body = req.body as Omit<CreateOrderInput, "idempotencyKey">;
  const ctx: OrderContext = {
    ...(req.user ? { userId: req.user._id } : {}),
    ...(req.ip ? { ip: req.ip } : {}),
  };

  const result = await createOrder({ ...body, idempotencyKey }, ctx);
  sendResponse(res, 201, "Orden creada correctamente.", result);
});

const detailByPublicId = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOrderByPublicId(req.params.publicId as string);
  sendResponse(res, 200, "Orden obtenida correctamente.", { order });
});

const requireUserId = (req: Request) => {
  if (!req.user) throw new AppError("No has iniciado sesión.", 401);
  return req.user._id;
};

const listMine = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listMyOrders(requireUserId(req), req.query);
  sendResponse(res, 200, "Órdenes obtenidas correctamente.", { orders: items }, meta);
});

const detailMine = asyncHandler(async (req: Request, res: Response) => {
  const order = await getMyOrder(requireUserId(req), req.params.id as string);
  sendResponse(res, 200, "Orden obtenida correctamente.", { order });
});

const tracking = asyncHandler(async (req: Request, res: Response) => {
  const shipment = await getPublicTracking(req.params.publicId as string);
  sendResponse(res, 200, "Seguimiento obtenido correctamente.", { tracking: shipment });
});

export { create, detailByPublicId, listMine, detailMine, tracking };
