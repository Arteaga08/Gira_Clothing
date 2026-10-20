import type { ShippingParcel, ShippingParcelSettings } from "@gira/shared";
import { AppError } from "../utils/AppError.js";

/**
 * Pure: derives the single parcel of an order from product weights and the
 * standard box in Settings. No I/O, so the arithmetic is pinned in unit tests
 * (the same resolver feeds the quote and the order, so both see the same parcel).
 */

interface ParcelLine {
  weightGrams: number;
  qty: number;
}

const computeParcel = (lines: ParcelLine[], cfg: ShippingParcelSettings): ShippingParcel => {
  if (lines.some((l) => l.weightGrams < 1)) {
    throw new AppError("No pudimos calcular el envío de uno de los artículos.", 422);
  }

  const units = lines.reduce((sum, l) => sum + l.qty, 0);
  const weightGrams = lines.reduce((sum, l) => sum + l.weightGrams * l.qty, 0) + cfg.tareGrams;
  if (weightGrams > cfg.maxWeightGrams) {
    throw new AppError(
      "Tu pedido pesa demasiado para un solo envío. Divide la compra en dos pedidos.",
      422,
    );
  }

  return {
    weightGrams,
    lengthCm: cfg.boxLengthCm,
    widthCm: cfg.boxWidthCm,
    heightCm: cfg.boxHeightCm + Math.max(0, units - 1) * cfg.extraUnitHeightCm,
  };
};

export type { ParcelLine };
export { computeParcel };
