import type { Request, Response } from "express";
import type { ShipmentStatus } from "@gira/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  createShipment,
  addShipmentEvent,
  getAdminShipment,
} from "../services/shipmentService.js";

/** Nested under /admin/orders/:id — the order id arrives via mergeParams. */

const create = asyncHandler(async (req: Request, res: Response) => {
  const shipment = await createShipment(
    req.params.id as string,
    req.body as { carrier: string; trackingNumber: string; trackingUrl?: string },
    buildContext(req),
  );
  sendResponse(res, 201, "Envío registrado correctamente.", { shipment });
});

const addEvent = asyncHandler(async (req: Request, res: Response) => {
  const shipment = await addShipmentEvent(
    req.params.id as string,
    req.body as { status: ShipmentStatus; note?: string },
    buildContext(req),
  );
  sendResponse(res, 200, "Estado del envío actualizado correctamente.", { shipment });
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const shipment = await getAdminShipment(req.params.id as string);
  sendResponse(res, 200, "Envío obtenido correctamente.", { shipment });
});

export { create, addEvent, detail };
