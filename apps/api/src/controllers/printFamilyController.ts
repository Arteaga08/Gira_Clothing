import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  createPrintFamily,
  listPrintFamilies,
  getPrintFamily,
  updatePrintFamily,
  deactivatePrintFamily,
  type CreatePrintFamilyInput,
  type UpdatePrintFamilyInput,
} from "../services/printFamilyService.js";

/**
 * PrintFamily admin controllers — orchestrate req/res only, never touch models.
 */

const create = asyncHandler(async (req: Request, res: Response) => {
  const family = await createPrintFamily(
    req.body as CreatePrintFamilyInput,
    buildContext(req),
  );
  sendResponse(res, 201, "Familia de estampados creada correctamente.", { family });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listPrintFamilies(req.query);
  sendResponse(res, 200, "Familias de estampados obtenidas correctamente.", { families: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const family = await getPrintFamily(req.params.id as string);
  sendResponse(res, 200, "Familia de estampados obtenida correctamente.", { family });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const family = await updatePrintFamily(
    req.params.id as string,
    req.body as UpdatePrintFamilyInput,
    buildContext(req),
  );
  sendResponse(res, 200, "Familia de estampados actualizada correctamente.", { family });
});

const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const family = await deactivatePrintFamily(req.params.id as string, buildContext(req));
  sendResponse(res, 200, "Familia de estampados retirada correctamente.", { family });
});

export { create, list, detail, update, deactivate };
