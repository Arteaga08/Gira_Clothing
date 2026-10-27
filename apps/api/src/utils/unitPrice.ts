interface PricedProduct {
  basePrice: number;
  salePrice?: number | null | undefined;
}

interface UnitPrice {
  /** What one unit costs, MXN centavos. */
  priceMxn: number;
  /** The price to strike through; present only while the unit is on sale. */
  compareAtMxn?: number;
  onSale: boolean;
}

/**
 * The single rule for what one unit costs: a print's own price (`priceOverride`)
 * wins and is never struck through; otherwise the model's sale price, otherwise
 * its base price. A sale price that does not go below the base price is ignored,
 * so corrupt data can never raise a price or show a fake discount.
 */
const resolveUnitPrice = (product: PricedProduct, priceOverride?: number | null): UnitPrice => {
  if (priceOverride !== undefined && priceOverride !== null) return { priceMxn: priceOverride, onSale: false };
  const { basePrice, salePrice } = product;
  if (salePrice !== undefined && salePrice !== null && salePrice < basePrice) {
    return { priceMxn: salePrice, compareAtMxn: basePrice, onSale: true };
  }
  return { priceMxn: basePrice, onSale: false };
};

export type { PricedProduct, UnitPrice };
export { resolveUnitPrice };
