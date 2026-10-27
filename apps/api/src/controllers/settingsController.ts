import type { Request, Response } from "express";
import type { StorefrontAnnouncement, StorefrontHero, StorefrontOfferBanner } from "@gira/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  getPublicSettings,
  updateShippingSettings,
  updateCurrencySettings,
  updateReservationSettings,
  updateInventorySettings,
  updateTaxSettings,
  updateAnnouncementSettings,
  getPublicAnnouncement,
  updateHeroSettings,
  getPublicHero,
  updateOfferBannerSettings,
  getPublicOfferBanner,
  updateEventsSettings,
  getPublicEvents,
  type ShippingSettings,
  type CurrencySettings,
  type ReservationSettings,
  type InventorySettings,
  type TaxSettings,
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

const updateInventory = asyncHandler(async (req: Request, res: Response) => {
  const settings = await updateInventorySettings(
    req.body as Partial<InventorySettings>,
    buildContext(req),
  );
  sendResponse(res, 200, "Configuración de inventario actualizada correctamente.", { settings });
});

const updateTax = asyncHandler(async (req: Request, res: Response) => {
  const settings = await updateTaxSettings(req.body as TaxSettings, buildContext(req));
  sendResponse(res, 200, "Tasa de IVA actualizada correctamente.", { settings });
});

const updateAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const settings = await updateAnnouncementSettings(req.body as StorefrontAnnouncement, buildContext(req));
  sendResponse(res, 200, "Barra de anuncios actualizada correctamente.", { settings });
});

const publicAnnouncement = asyncHandler(async (_req: Request, res: Response) => {
  const announcement = await getPublicAnnouncement();
  sendResponse(res, 200, "Anuncio obtenido correctamente.", { announcement });
});

const updateHero = asyncHandler(async (req: Request, res: Response) => {
  const settings = await updateHeroSettings(req.body as StorefrontHero, buildContext(req));
  sendResponse(res, 200, "Portada de la tienda actualizada correctamente.", { settings });
});

const publicHero = asyncHandler(async (_req: Request, res: Response) => {
  const hero = await getPublicHero();
  sendResponse(res, 200, "Portada obtenida correctamente.", { hero });
});

const updateOfferBanner = asyncHandler(async (req: Request, res: Response) => {
  const settings = await updateOfferBannerSettings(req.body as StorefrontOfferBanner, buildContext(req));
  sendResponse(res, 200, "Banner de ofertas actualizado correctamente.", { settings });
});

const publicOfferBanner = asyncHandler(async (_req: Request, res: Response) => {
  const banner = await getPublicOfferBanner();
  sendResponse(res, 200, "Banner de ofertas obtenido correctamente.", { banner });
});

const updateEvents = asyncHandler(async (req: Request, res: Response) => {
  const settings = await updateEventsSettings(req.body as Parameters<typeof updateEventsSettings>[0], buildContext(req));
  sendResponse(res, 200, "Eventos actualizados correctamente.", { settings });
});

const publicEvents = asyncHandler(async (_req: Request, res: Response) => {
  const events = await getPublicEvents();
  sendResponse(res, 200, "Eventos obtenidos correctamente.", { events });
});

export {
  detail,
  updateShipping,
  updateCurrency,
  updateReservation,
  updateInventory,
  updateTax,
  updateAnnouncement,
  publicAnnouncement,
  updateHero,
  publicHero,
  updateOfferBanner,
  publicOfferBanner,
  updateEvents,
  publicEvents,
};
