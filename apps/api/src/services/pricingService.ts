import type { Types } from "mongoose";
import { Currency, CouponDiscountType } from "@gira/shared";
import type { PriceRounding, OrderCoupon } from "@gira/shared";
import { Variant } from "../models/Variant.js";
import { AppError } from "../utils/AppError.js";
import { convertFromMxn } from "../utils/money.js";
import { splitTax } from "../utils/orderTax.js";
import { computeCouponDiscount } from "../utils/couponDiscount.js";
import { resolveUnitPrice } from "../utils/unitPrice.js";
import { assertMeetsMinimum } from "./couponRulesService.js";
import type { CouponDocument } from "../models/Coupon.js";
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
 * Shipping arrives already decided (MXN centavos) from the stored shipping quote,
 * which also applies the free-shipping threshold against the MXN subtotal.
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
  /** Sold below the model's base price (sale price). Coupons never discount these lines. */
  onSale: boolean;
  /** Packed weight of one unit; 0 = the product has no weight configured yet. */
  weightGrams: number;
}

interface QuotedLine extends ResolvedLine {
  unitPrice: number;
  lineTotal: number;
}

interface AppliedCoupon {
  couponId: Types.ObjectId;
  snapshot: OrderCoupon;
}

interface Quote {
  currency: Currency;
  exchangeRate: number;
  rounding: PriceRounding;
  lines: QuotedLine[];
  subtotalMxn: number;
  subtotal: number;
  /** Coupon discount in the charge currency; 0 without a coupon. Shipping is never discounted. */
  discount: number;
  /** The coupon that produced `discount`, ready to freeze on the order. Absent when none applied. */
  coupon?: AppliedCoupon;
  shippingCost: number;
  /** Rate used to derive `tax`, frozen on the order. */
  taxRateBps: number;
  /** IVA included in `total` (a breakdown, not an addition). */
  tax: number;
  total: number;
}

interface ProductRef {
  _id: Types.ObjectId;
  name: string;
  basePrice: number;
  salePrice?: number;
  weightGrams?: number;
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
    .populate("product", "name basePrice salePrice weightGrams isActive")
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

    const { priceMxn, onSale } = resolveUnitPrice(product, variant.priceOverride);

    return {
      variant: variant._id,
      product: product._id,
      sku: variant.sku,
      productName: product.name,
      printName: print.name,
      ...(variant.images[0] ? { image: variant.images[0] } : {}),
      qty: line.qty,
      unitPriceMxn: priceMxn,
      onSale,
      weightGrams: product.weightGrams ?? 0,
    };
  });
};

interface QuoteInput {
  currency: Currency;
  /**
   * Shipping charged to the customer, MXN centavos. It was decided by the stored
   * shipping quote (already 0 when free shipping applied), never by the client.
   */
  shippingMxn: number;
  /** An already-eligible coupon (couponRulesService); the amount is computed here, never by the client. */
  coupon?: CouponDocument;
}

const toAppliedCoupon = (coupon: CouponDocument): AppliedCoupon => ({
  couponId: coupon._id,
  snapshot: {
    code: coupon.code,
    discountType: coupon.discountType,
    value:
      coupon.discountType === CouponDiscountType.PERCENT
        ? (coupon.percentOff as number)
        : (coupon.amountOffMxn as number),
  },
});

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

  const shippingCost = convertFromMxn(input.shippingMxn, input.currency, mxnPerUsdCents, rounding);

  if (input.coupon) assertMeetsMinimum(input.coupon, subtotalMxn);
  // Items on sale are excluded from the coupon base; the minimum above still counts them.
  const eligibleSubtotal = quotedLines.reduce((sum, l) => (l.onSale ? sum : sum + l.lineTotal), 0);
  if (input.coupon && subtotal > 0 && eligibleSubtotal === 0) {
    throw new AppError("Este cupón no aplica a artículos en rebaja.", 400);
  }
  const discount = input.coupon
    ? computeCouponDiscount(input.coupon, eligibleSubtotal, input.currency, { mxnPerUsdCents, rounding })
    : 0;
  const total = Math.max(0, subtotal - discount + shippingCost);
  const taxRateBps = settings.tax.rateBps;
  const { tax } = splitTax(total, taxRateBps);

  return {
    currency: input.currency,
    exchangeRate: mxnPerUsdCents,
    rounding,
    lines: quotedLines,
    subtotalMxn,
    subtotal,
    discount,
    // A coupon that discounts nothing (e.g. an empty subtotal) is not redeemed.
    ...(input.coupon && discount > 0 ? { coupon: toAppliedCoupon(input.coupon) } : {}),
    shippingCost,
    taxRateBps,
    tax,
    total,
  };
};

export type { RequestedLine, ResolvedLine, QuotedLine, Quote, QuoteInput, AppliedCoupon };
export { resolveOrderLines, quoteTotals, UNAVAILABLE };
