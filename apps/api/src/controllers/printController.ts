import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  createPrint,
  listPrints,
  getPrint,
  updatePrint,
  deactivatePrint,
  type CreatePrintInput,
  type UpdatePrintInput,
} from "../services/printService.js";

/**
 * Print admin controllers — orchestrate req/res only, never touch models.
 */

const create = asyncHandler(async (req: Request, res: Response) => {
  const print = await createPrint(req.body as CreatePrintInput, buildContext(req));
  sendResponse(res, 201, "Estampado creado correctamente.", { print });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listPrints(req.query);
  sendResponse(res, 200, "Estampados obtenidos correctamente.", { prints: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const print = await getPrint(req.params.id as string);
  sendResponse(res, 200, "Estampado obtenido correctamente.", { print });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const print = await updatePrint(
    req.params.id as string,
    req.body as UpdatePrintInput,
    buildContext(req),
  );
  sendResponse(res, 200, "Estampado actualizado correctamente.", { print });
});

const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const print = await deactivatePrint(req.params.id as string, buildContext(req));
  sendResponse(res, 200, "Estampado retirado correctamente.", { print });
});

export { create, list, detail, update, deactivate };
