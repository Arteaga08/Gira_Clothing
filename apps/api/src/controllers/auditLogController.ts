import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { listAuditLogs, getAuditLog } from "../services/auditService.js";

/**
 * Audit log controller — read-only, orchestrates req/res only, never touches
 * models. There is no create/update/delete route here on purpose: the trail
 * stays append-only from the outside world's point of view.
 */
const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listAuditLogs(req.query);
  sendResponse(res, 200, "Bitácora de auditoría obtenida correctamente.", { logs: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const log = await getAuditLog(String(req.params.id));
  sendResponse(res, 200, "Registro de auditoría obtenido correctamente.", { log });
});

export { list, detail };
