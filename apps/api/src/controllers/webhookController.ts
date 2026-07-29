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

  // Always 200 once the signature checked out: a 4xx/5xx makes Stripe retry,
  // and there is nothing to retry for a duplicate or an event we chose to ignore.
  sendResponse(res, 200, outcome === "duplicate" ? "Evento ya procesado." : "Evento procesado.");
});

export { stripeWebhook };
