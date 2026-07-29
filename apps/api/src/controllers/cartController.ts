import type { Request, Response } from "express";
import { Types } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { AppError } from "../utils/AppError.js";
import { getCart, setCartLine, removeCartLine, clearCart } from "../services/cartService.js";

/**
 * Cart controllers — orchestrate req/res only, never touch models. Every route
 * here sits behind `protect` (mounted at the router), so req.user is always set
 * by the time these run; the guard below is defense-in-depth, not the real gate.
 */

const requireUserId = (req: Request): Types.ObjectId => {
  if (!req.user) throw new AppError("No has iniciado sesión.", 401);
  return req.user._id;
};

const detail = asyncHandler(async (req: Request, res: Response) => {
  const cart = await getCart(requireUserId(req));
  sendResponse(res, 200, "Carrito obtenido correctamente.", { cart });
});

const setLine = asyncHandler(async (req: Request, res: Response) => {
  const { qty } = req.body as { qty: number };
  const cart = await setCartLine(requireUserId(req), req.params.variantId as string, qty);
  sendResponse(res, 200, "Carrito actualizado correctamente.", { cart });
});

const removeLine = asyncHandler(async (req: Request, res: Response) => {
  const cart = await removeCartLine(requireUserId(req), req.params.variantId as string);
  sendResponse(res, 200, "Artículo eliminado del carrito.", { cart });
});

const clear = asyncHandler(async (req: Request, res: Response) => {
  const cart = await clearCart(requireUserId(req));
  sendResponse(res, 200, "Carrito vaciado correctamente.", { cart });
});

export { detail, setLine, removeLine, clear };
