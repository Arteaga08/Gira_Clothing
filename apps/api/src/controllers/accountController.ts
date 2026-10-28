import type { Request, Response } from "express";
import type { UpdateProfileRequest } from "@gira/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { AppError } from "../utils/AppError.js";
import { getAccountProfile, updateAccountProfile } from "../services/accountService.js";

/**
 * Account controllers — orchestrate req/res only. The router already applies
 * `protect` + `restrictTo(customer)`; the guard below is defense-in-depth.
 */

const requireUser = (req: Request) => {
  if (!req.user) throw new AppError("No has iniciado sesión.", 401);
  return req.user;
};

const getAccount = asyncHandler(async (req: Request, res: Response) => {
  const profile = await getAccountProfile(requireUser(req)._id);
  sendResponse(res, 200, "Cuenta obtenida correctamente.", { profile });
});

const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await updateAccountProfile(requireUser(req)._id, req.body as UpdateProfileRequest);
  sendResponse(res, 200, "Guardamos tus cambios.", { profile });
});

export { getAccount, updateProfile };
