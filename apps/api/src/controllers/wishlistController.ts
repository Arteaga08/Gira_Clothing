import type { Request, Response } from "express";
import { Types } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { AppError } from "../utils/AppError.js";
import {
  listWishlist,
  listWishlistIds,
  addWishlistItem,
  removeWishlistItem,
} from "../services/wishlistService.js";

/**
 * Wishlist controllers — orchestrate req/res only. Every route sits behind
 * `protect`; the guard below is defense-in-depth, not the real gate.
 */

const requireUserId = (req: Request): Types.ObjectId => {
  if (!req.user) throw new AppError("No has iniciado sesión.", 401);
  return req.user._id;
};

const list = asyncHandler(async (req: Request, res: Response) => {
  const items = await listWishlist(requireUserId(req));
  sendResponse(res, 200, "Guardados obtenidos correctamente.", { items });
});

const ids = asyncHandler(async (req: Request, res: Response) => {
  const variantIds = await listWishlistIds(requireUserId(req));
  sendResponse(res, 200, "Guardados obtenidos correctamente.", { variantIds });
});

const save = asyncHandler(async (req: Request, res: Response) => {
  await addWishlistItem(requireUserId(req), req.params.variantId as string);
  sendResponse(res, 200, "Producto guardado.");
});

const unsave = asyncHandler(async (req: Request, res: Response) => {
  await removeWishlistItem(requireUserId(req), req.params.variantId as string);
  sendResponse(res, 200, "Producto quitado de guardados.");
});

export { list, ids, save, unsave };
