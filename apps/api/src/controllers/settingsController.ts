import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  getPublicSettings,
  updateShippingSettings,
  updateCurrencySettings,
  updateReservationSettings,
  type ShippingSettings,
  type CurrencySettings,
  type ReservationSettings,
} from "../services/settingsService.js";

/**
 * Settings admin controllers — orchestrate req/res only, never touch models.
 */

const detail = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await getPublicSettings();
  sendResponse(res, 200, "Configuración obtenida correctamente.", { settings });
});

const updateShipping = asyncHandler(async (req: Request, res: Response) => {
  const settings = await updateShippingSettings(
    req.body as Partial<ShippingSettings>,
    buildContext(req),
  );
  sendResponse(res, 200, "Configuración de envío actualizada correctamente.", { settings });
});

const updateCurrency = asyncHandler(async (req: Request, res: Response) => {
  const settings = await updateCurrencySettings(
    req.body as Partial<CurrencySettings>,
    buildContext(req),
  );
  sendResponse(res, 200, "Configuración de moneda actualizada correctamente.", { settings });
});

const updateReservation = asyncHandler(async (req: Request, res: Response) => {
  const settings = await updateReservationSettings(
    req.body as Partial<ReservationSettings>,
    buildContext(req),
  );
  sendResponse(res, 200, "Configuración de reserva actualizada correctamente.", { settings });
});

export { detail, updateShipping, updateCurrency, updateReservation };
