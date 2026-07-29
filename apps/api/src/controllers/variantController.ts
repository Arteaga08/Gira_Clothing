import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  createVariant,
  listVariants,
  getVariant,
  updateVariant,
  deactivateVariant,
  type CreateVariantInput,
  type UpdateVariantInput,
} from "../services/variantService.js";
import { setOnHand, adjustOnHand } from "../services/inventoryService.js";
import { getInventoryStats } from "../services/inventoryStatsService.js";

/**
 * Variant admin controllers — orchestrate req/res only, never touch models.
 */

const create = asyncHandler(async (req: Request, res: Response) => {
  const variant = await createVariant(req.body as CreateVariantInput, buildContext(req));
  sendResponse(res, 201, "Variante creada correctamente.", { variant });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listVariants(req.query);
  sendResponse(res, 200, "Variantes obtenidas correctamente.", { variants: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const variant = await getVariant(req.params.id as string);
  sendResponse(res, 200, "Variante obtenida correctamente.", { variant });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const variant = await updateVariant(
    req.params.id as string,
    req.body as UpdateVariantInput,
    buildContext(req),
  );
  sendResponse(res, 200, "Variante actualizada correctamente.", { variant });
});

const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const variant = await deactivateVariant(req.params.id as string, buildContext(req));
  sendResponse(res, 200, "Variante retirada correctamente.", { variant });
});

const updateStock = asyncHandler(async (req: Request, res: Response) => {
  const { onHand, delta } = req.body as { onHand?: number; delta?: number };
  const id = req.params.id as string;
  const ctx = buildContext(req);
  const variant =
    onHand !== undefined
      ? await setOnHand(id, onHand, ctx)
      : await adjustOnHand(id, delta as number, ctx);
  sendResponse(res, 200, "Stock actualizado correctamente.", { variant });
});

const stats = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getInventoryStats();
  sendResponse(res, 200, "Estadísticas de inventario obtenidas correctamente.", data);
});

export { create, list, detail, update, deactivate, updateStock, stats };
