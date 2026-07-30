import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { listUsers } from "../services/userService.js";

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listUsers(req.query);
  sendResponse(res, 200, "Clientes obtenidos correctamente.", { users: items }, meta);
});

export { list };
