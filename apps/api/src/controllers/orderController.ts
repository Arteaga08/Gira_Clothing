import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { AppError } from "../utils/AppError.js";
import {
  createOrder,
  getOrderByPublicId,
  listMyOrders,
  getMyOrder,
  type CreateOrderInput,
  type OrderContext,
} from "../services/orderService.js";

/**
 * Order controllers — orchestrate req/res only, never touch models.
 */

const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

const requireIdempotencyKey = (req: Request): string => {
  const header = req.headers["idempotency-key"];
  const key = typeof header === "string" ? header.trim() : "";
  if (key.length < MIN_IDEMPOTENCY_KEY_LENGTH || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new AppError(
      "Falta o es inválido el header Idempotency-Key (mínimo 8 caracteres).",
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

export { create, detailByPublicId, listMine, detailMine };
