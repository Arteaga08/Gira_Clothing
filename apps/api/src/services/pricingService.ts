import type { Types } from "mongoose";
import { Currency } from "@gira/shared";
import type { PriceRounding } from "@gira/shared";
import { Variant } from "../models/Variant.js";
import { AppError } from "../utils/AppError.js";
import { convertFromMxn } from "../utils/money.js";
import { getSettings } from "./settingsService.js";
import type { ImageAttrs } from "../models/schemas/image.js";

/**
 * The single origin of every price in the system. The client's payload NEVER
 * determines what is charged (ECOMMERCE_ARCHITECTURE_GUIDELINES, "El servidor
 * calcula el monto"): the client sends variant ids and quantities, nothing else.
 *
 * Order of operations matters. Everything is priced in MXN centavos, then each
 * UNIT price is converted to the charge currency, and only then are the lines
 * summed. Converting the total instead would leave `subtotal !== Σ lines` by a
 * cent or two — and Stripe charges the total, so the customer's receipt would
 * not add up.
 *
 * The free-shipping threshold is always compared against the MXN subtotal,
 * whatever the charge currency: one configured threshold, one meaning.
 */

interface RequestedLine {
  variantId: string;
  qty: number;
}

interface ResolvedLine {
  variant: Types.ObjectId;
  product: Types.ObjectId;
  sku: string;
  productName: string;
  printName: string;
  image?: ImageAttrs;
  qty: number;
  unitPriceMxn: number;
}

interface QuotedLine extends ResolvedLine {
  unitPrice: number;
  lineTotal: number;
}

interface Quote {
  currency: Currency;
  exchangeRate: number;
  rounding: PriceRounding;
  lines: QuotedLine[];
  subtotalMxn: number;
  subtotal: number;
  shippingCost: number;
  total: number;
}

interface ProductRef {
  _id: Types.ObjectId;
  name: string;
  basePrice: number;
  isActive: boolean;
}

interface PrintRef {
  _id: Types.ObjectId;
  name: string;
  isActive: boolean;
}

const UNAVAILABLE = "Uno de los artículos ya no está disponible.";

/**
 * Loads each requested variant with its parents and rejects anything that is no
 * longer sellable. A variant whose product or print was retired is an ORPHAN:
 * it stays invisible in the public catalog but is still reachable by id, so the
 * check has to happen here too (M2 post-review, pendiente #2).
 */
const resolveOrderLines = async (requested: RequestedLine[]): Promise<ResolvedLine[]> => {
  const ids = requested.map((l) => l.variantId);
  if (new Set(ids).size !== ids.length) {
    throw new AppError("No repitas el mismo artículo: usa la cantidad.", 400);
  }

  const variants = await Variant.find({ _id: { $in: ids } })
    .populate("product", "name basePrice isActive")
    .populate("print", "name isActive")
    .lean();

  const byId = new Map(variants.map((v) => [String(v._id), v]));

  return requested.map((line) => {
    const variant = byId.get(line.variantId);
    if (!variant) throw new AppError("Uno de los artículos no existe.", 400);

    const product = variant.product as unknown as ProductRef;
    const print = variant.print as unknown as PrintRef;
    if (!variant.isActive || !product.isActive || !print.isActive) {
      throw new AppError(UNAVAILABLE, 409);
    }

    return {
      variant: variant._id,
      product: product._id,
      sku: variant.sku,
      productName: product.name,
      printName: print.name,
      ...(variant.images[0] ? { image: variant.images[0] } : {}),
      qty: line.qty,
      unitPriceMxn: variant.priceOverride ?? product.basePrice,
    };
  });
};

interface QuoteInput {
  currency: Currency;
  /** ISO-3166 alpha-2. "MX" is national, anything else international. */
  destinationCountry: string;
}

const quoteTotals = async (lines: ResolvedLine[], input: QuoteInput): Promise<Quote> => {
  const settings = await getSettings();
  const { mxnPerUsdCents, rounding } = settings.currency;

  if (!settings.currency.supported.includes(input.currency)) {
    throw new AppError("La moneda seleccionada no está disponible.", 400);
  }

  const subtotalMxn = lines.reduce((sum, l) => sum + l.unitPriceMxn * l.qty, 0);

  const quotedLines: QuotedLine[] = lines.map((l) => {
    const unitPrice = convertFromMxn(l.unitPriceMxn, input.currency, mxnPerUsdCents, rounding);
    return { ...l, unitPrice, lineTotal: unitPrice * l.qty };
  });

  const subtotal = quotedLines.reduce((sum, l) => sum + l.lineTotal, 0);

  const { nationalFee, internationalFee, freeShippingThreshold } = settings.shipping;
  const feeMxn = input.destinationCountry === "MX" ? nationalFee : internationalFee;
  // Threshold is always read against the MXN subtotal, whatever we charge in.
  const shipsFree = freeShippingThreshold !== null && subtotalMxn >= freeShippingThreshold;
  const shippingCost = shipsFree
    ? 0
    : convertFromMxn(feeMxn, input.currency, mxnPerUsdCents, rounding);

  return {
    currency: input.currency,
    exchangeRate: mxnPerUsdCents,
    rounding,
    lines: quotedLines,
    subtotalMxn,
    subtotal,
    shippingCost,
    total: subtotal + shippingCost,
  };
};

export type { RequestedLine, ResolvedLine, QuotedLine, Quote, QuoteInput };
export { resolveOrderLines, quoteTotals, UNAVAILABLE };
