import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { AppError } from "../utils/AppError.js";
import { handleStripeWebhook } from "../services/webhookService.js";
import { handleShippingWebhook } from "../services/shippingWebhookService.js";

const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    throw new AppError("Falta la firma del webhook.", 400);
  }

  // Throws AppError(400) on a bad signature or a timestamp outside tolerance.
  const outcome = await handleStripeWebhook(req.body as Buffer, signature);

  // 200 for processed/duplicate/ignored: nothing to retry. If the effect threw,
  // handleStripeWebhook rethrows (500) on purpose so Stripe redelivers it.
  sendResponse(res, 200, outcome === "duplicate" ? "Evento ya procesado." : "Evento procesado.");
});

const enviaWebhook = asyncHandler(async (req: Request, res: Response) => {
  // express.raw leaves a non-Buffer body when the content-type is not JSON.
  if (!Buffer.isBuffer(req.body)) throw new AppError("Cuerpo de webhook inválido.", 400);
  const outcome = await handleShippingWebhook(req.body, req.headers);
  sendResponse(res, 200, outcome === "duplicate" ? "Evento ya procesado." : "Evento procesado.");
});

export { stripeWebhook, enviaWebhook };
