import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  createVariant,
  updateVariant,
  deactivateVariant,
  type CreateVariantInput,
  type UpdateVariantInput,
} from "../services/variantService.js";
import {
  listAdminVariants,
  getAdminVariantOrThrow,
  getVariantActivity,
} from "../services/adminVariantService.js";
import { setOnHand, adjustOnHand } from "../services/inventoryService.js";
import { getInventoryStats } from "../services/inventoryStatsService.js";

/**
 * Variant admin controllers — orchestrate req/res only, never touch models.
 */

const create = asyncHandler(async (req: Request, res: Response) => {
  const created = await createVariant(req.body as CreateVariantInput, buildContext(req));
  const variant = await getAdminVariantOrThrow(created.id, true);
  sendResponse(res, 201, "Variante creada correctamente.", { variant });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listAdminVariants(req.query);
  sendResponse(res, 200, "Variantes obtenidas correctamente.", { variants: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const variant = await getAdminVariantOrThrow(req.params.id as string, true);
  sendResponse(res, 200, "Variante obtenida correctamente.", { variant });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await updateVariant(id, req.body as UpdateVariantInput, buildContext(req));
  const variant = await getAdminVariantOrThrow(id, true);
  sendResponse(res, 200, "Variante actualizada correctamente.", { variant });
});

const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deactivateVariant(id, buildContext(req));
  const variant = await getAdminVariantOrThrow(id, true);
  sendResponse(res, 200, "Variante retirada correctamente.", { variant });
});

const updateStock = asyncHandler(async (req: Request, res: Response) => {
  const { onHand, delta, reason } = req.body as {
    onHand?: number;
    delta?: number;
    reason?: string;
  };
  const id = req.params.id as string;
  const ctx = buildContext(req);
  if (onHand !== undefined) await setOnHand(id, onHand, ctx, reason);
  else await adjustOnHand(id, delta as number, ctx, reason);
  const variant = await getAdminVariantOrThrow(id);
  sendResponse(res, 200, "Stock actualizado correctamente.", { variant });
});

const activity = asyncHandler(async (req: Request, res: Response) => {
  const rows = await getVariantActivity(req.params.id as string);
  sendResponse(res, 200, "Movimientos de inventario obtenidos correctamente.", { activity: rows });
});

const stats = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getInventoryStats();
  sendResponse(res, 200, "Estadísticas de inventario obtenidas correctamente.", data);
});

export { create, list, detail, update, deactivate, updateStock, stats, activity };
