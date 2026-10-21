import type { Request, Response } from "express";
import type { CustomerRankPeriod, CustomerRankSort } from "@gira/shared";
import { buildContext } from "../utils/requestContext.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { getTopCustomers } from "../services/customerRankingService.js";
import { giveCouponToCustomer, type GiveCouponInput } from "../services/couponGrantService.js";
import { getAdminCustomerOrThrow, listAdminCustomers } from "../services/adminCustomerService.js";

/** Customer admin controllers: req/res only. */

const top = asyncHandler(async (req: Request, res: Response) => {
  const { period, sortBy } = req.query as unknown as { period: CustomerRankPeriod; sortBy: CustomerRankSort };
  const ranking = await getTopCustomers({ period, sortBy });
  sendResponse(res, 200, "Ranking de clientes obtenido correctamente.", { ranking });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listAdminCustomers(req.query);
  sendResponse(res, 200, "Clientes obtenidos correctamente.", { customers: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const customer = await getAdminCustomerOrThrow(req.params.id as string);
  sendResponse(res, 200, "Cliente obtenido correctamente.", { customer });
});

const giveCoupon = asyncHandler(async (req: Request, res: Response) => {
  const result = await giveCouponToCustomer(req.params.id as string, req.body as GiveCouponInput, buildContext(req));
  sendResponse(
    res,
    201,
    result.emailSent ? "Cupón enviado correctamente." : "Cupón creado, pero el correo no salió.",
    result,
  );
});

export { top, list, detail, giveCoupon };
