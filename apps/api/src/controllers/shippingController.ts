import type { Request, Response } from "express";
import type { Currency } from "@gira/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { AppError } from "../utils/AppError.js";
import { takeCartLines } from "../services/orderService.js";
import { createShippingQuote } from "../services/shippingQuoteService.js";
import type { RequestedLine } from "../services/pricingService.js";

/**
 * Shipping controllers — orchestrate req/res only, never touch models.
 */

interface QuoteBody {
  lines?: RequestedLine[];
  useCart?: boolean;
  currency: Currency;
  destination: { postalCode: string; state: string; city: string };
}

const createQuote = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as QuoteBody;
  let lines = body.lines ?? [];
  if (body.useCart) {
    if (!req.user) throw new AppError("Inicia sesión para cotizar con tu carrito.", 401);
    lines = await takeCartLines(req.user._id);
    if (lines.length === 0) throw new AppError("Tu carrito está vacío.", 400);
  }
  const quote = await createShippingQuote(
    { lines, currency: body.currency, destination: body.destination },
    { userId: req.user?._id },
  );
  sendResponse(res, 200, "Cotización de envío calculada correctamente.", { quote });
});

export { createQuote };
