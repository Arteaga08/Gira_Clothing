import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { AppError } from "../utils/AppError.js";
import { handleStripeWebhook } from "../services/webhookService.js";

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

export { stripeWebhook };
