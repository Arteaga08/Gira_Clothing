import type { Types } from "mongoose";
import { Currency, type CheckoutSummary } from "@gira/shared";
import { AppError } from "../utils/AppError.js";
import {
  resolveOrderLines,
  quoteTotals,
  assertChargeable,
  type Quote,
  type RequestedLine,
  type ResolvedLine,
} from "./pricingService.js";
import { resolveCouponForCheckout } from "./couponRulesService.js";
import { resolveQuotedRate, type ResolvedRate } from "./shippingQuoteService.js";
import { Cart } from "../models/Cart.js";

/**
 * The one pricing chain of the checkout, shared by `POST /orders` and
 * `POST /orders/preview` so the total the customer sees is the total charged.
 * Every step can refuse before anything is held: lines (sellable), shipping
 * quote (same user, same cart, same CP), coupon (eligible), and the $10 floor.
 */

interface PriceCheckoutInput {
  requested: RequestedLine[];
  currency: Currency;
  userId: Types.ObjectId;
  couponCode?: string | undefined;
  /** Absent only in the preview, before a carrier is picked: shipping counts as 0. */
  shippingQuote?: { quoteId: string; rateId: string; postalCode: string } | undefined;
}

interface PricedCheckout {
  resolved: ResolvedLine[];
  shipping?: ResolvedRate;
  quote: Quote;
}

const takeCartLines = async (userId: Types.ObjectId): Promise<RequestedLine[]> => {
  const cart = await Cart.findOne({ user: userId }).lean();
  if (!cart || cart.lines.length === 0) return [];
  return cart.lines.map((l) => ({ variantId: String(l.variant), qty: l.qty }));
};

const priceCheckout = async (input: PriceCheckoutInput): Promise<PricedCheckout> => {
  if (input.requested.length === 0) {
    throw new AppError("No hay artículos para crear la orden.", 400);
  }
  const resolved = await resolveOrderLines(input.requested);
  const shipping = input.shippingQuote
    ? await resolveQuotedRate({
        quoteId: input.shippingQuote.quoteId,
        rateId: input.shippingQuote.rateId,
        resolved,
        postalCode: input.shippingQuote.postalCode,
        currency: input.currency,
        userId: input.userId,
      })
    : undefined;
  const coupon = input.couponCode
    ? await resolveCouponForCheckout(input.couponCode, input.userId)
    : undefined;
  const quote = await quoteTotals(resolved, {
    currency: input.currency,
    shippingMxn: shipping?.rate.amountMxn ?? 0,
    ...(coupon ? { coupon } : {}),
  });
  // Only a complete checkout (carrier chosen) can be judged against the floor;
  // a preview without shipping would flag a total that shipping later lifts.
  if (shipping) assertChargeable(quote);
  return { resolved, ...(shipping ? { shipping } : {}), quote };
};

interface PreviewInput {
  couponCode?: string;
  shippingQuote?: { quoteId: string; rateId: string };
  postalCode?: string;
}

/** Side-effect free: no reservation, no coupon seat. The cart is the account's. */
const previewCheckout = async (userId: Types.ObjectId, input: PreviewInput): Promise<CheckoutSummary> => {
  const { quote } = await priceCheckout({
    requested: await takeCartLines(userId),
    currency: Currency.MXN,
    userId,
    couponCode: input.couponCode,
    shippingQuote:
      input.shippingQuote && input.postalCode
        ? { ...input.shippingQuote, postalCode: input.postalCode }
        : undefined,
  });
  return {
    currency: quote.currency,
    subtotal: quote.subtotal,
    discount: quote.discount,
    shippingCost: quote.shippingCost,
    tax: quote.tax,
    taxRateBps: quote.taxRateBps,
    total: quote.total,
    coupon: quote.coupon?.snapshot ?? null,
  };
};

export type { PriceCheckoutInput, PricedCheckout, PreviewInput };
export { priceCheckout, previewCheckout, takeCartLines };
