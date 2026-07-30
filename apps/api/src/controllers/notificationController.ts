import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { getOutboxHealth } from "../services/notificationService.js";

const health = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getOutboxHealth();
  sendResponse(res, 200, "Salud de notificaciones obtenida correctamente.", data);
});

export { health };
