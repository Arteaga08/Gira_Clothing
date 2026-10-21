import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import { getAdminCouponOrThrow, listAdminCoupons } from "../services/adminCouponService.js";
import {
  createCoupon,
  updateCoupon,
  deactivateCoupon,
  type CreateCouponInput,
  type UpdateCouponInput,
} from "../services/couponService.js";

/**
 * Coupon admin controllers: req/res only. Every write re-reads through the
 * admin DTO so the panel always gets the computed status and counters.
 */

const create = asyncHandler(async (req: Request, res: Response) => {
  const { id } = await createCoupon(req.body as CreateCouponInput, buildContext(req));
  const coupon = await getAdminCouponOrThrow(id);
  sendResponse(res, 201, "Cupón creado correctamente.", { coupon });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listAdminCoupons(req.query);
  sendResponse(res, 200, "Cupones obtenidos correctamente.", { coupons: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const coupon = await getAdminCouponOrThrow(req.params.id as string);
  sendResponse(res, 200, "Cupón obtenido correctamente.", { coupon });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await updateCoupon(id, req.body as UpdateCouponInput, buildContext(req));
  const coupon = await getAdminCouponOrThrow(id);
  sendResponse(res, 200, "Cupón actualizado correctamente.", { coupon });
});

const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deactivateCoupon(id, buildContext(req));
  const coupon = await getAdminCouponOrThrow(id);
  sendResponse(res, 200, "Cupón retirado correctamente.", { coupon });
});

export { create, list, detail, update, deactivate };
