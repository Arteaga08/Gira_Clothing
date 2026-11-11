import type { ShippingDestination, ShippingQuoteResponse, Wire } from "@gira/shared";
import { browserRequest } from "./browser";
import { SHIPPING_QUOTES_PATH } from "./paths";
import { expectData } from "./request";

/**
 * Carrier rates for the signed-in customer's cart to a destination. The quote is tied to the account
 * and to this cart + postal code: an order only accepts a quote made under those same terms.
 */
const quoteCartShipping = async (destination: ShippingDestination): Promise<Wire<ShippingQuoteResponse>> =>
  expectData(
    await browserRequest<{ quote: ShippingQuoteResponse }>(SHIPPING_QUOTES_PATH, {
      method: "POST",
      body: { useCart: true, destination },
    }),
  ).quote;

export { quoteCartShipping };
