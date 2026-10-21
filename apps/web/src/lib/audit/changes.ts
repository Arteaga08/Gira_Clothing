import {
  DISPUTE_STATUS_LABELS,
  ORDER_PRIORITY_LABELS,
  ORDER_STATUS_LABELS,
  PriceRounding,
  SHIPMENT_TRACKING_STATUS_LABELS,
} from "@gira/shared";
import { formatMxn } from "@/lib/coupons/money";
import { formatInteger } from "@/lib/format";
import { formatTaxRate } from "@/lib/settings/tax";

const ROUNDING_LABELS: Readonly<Record<string, string>> = {
  [PriceRounding.NONE]: "Sin redondeo",
  [PriceRounding.UP_TO_50_CENTS]: "Al siguiente 0.50",
  [PriceRounding.UP_TO_UNIT]: "Al siguiente entero",
};

const LABELS_BY_FIELD: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  status: ORDER_STATUS_LABELS,
  priority: ORDER_PRIORITY_LABELS,
  disputeStatus: DISPUTE_STATUS_LABELS,
  tracking: SHIPMENT_TRACKING_STATUS_LABELS,
  rounding: ROUNDING_LABELS,
};

const EMPTY = "—";

/** One side of a change, in the operator's words: labels for enums, money as money, the rate as a percent. */
const formatChangeValue = (field: string, value: unknown): string => {
  if (value === undefined) return EMPTY;
  if (field === "freeShippingThreshold") return value === null ? "No se ofrece" : formatMxn(Number(value));
  if (value === null) return EMPTY;
  if (field === "rateBps" && typeof value === "number") return formatTaxRate(value);
  if (field === "mxnPerUsdCents" && typeof value === "number") return formatMxn(value);
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return formatInteger(value);
  if (typeof value === "string") return LABELS_BY_FIELD[field]?.[value] ?? value;
  // The API only lets scalars through; anything else is shown raw rather than as "[object Object]".
  return JSON.stringify(value);
};

export { formatChangeValue };
