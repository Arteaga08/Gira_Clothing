import type { Currency } from "../enums/money.js";
import type { ShippingCarrier, ShippingLabelStatus, ShippingProviderName } from "../enums/shipping.js";

/** Warehouse the parcels leave from. Business data (not customer PII), edited in Ajustes. */
interface ShippingOrigin {
  name: string;
  phone: string;
  email?: string;
  line1: string;
  district: string;
  city: string;
  /** Code from MEXICAN_STATES. */
  state: string;
  postalCode: string;
}

interface ShippingParcel {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/** Standard box + packaging used to derive a parcel from the cart's product weights. */
interface ShippingParcelSettings {
  tareGrams: number;
  boxLengthCm: number;
  boxWidthCm: number;
  boxHeightCm: number;
  /** Height added per garment beyond the first. */
  extraUnitHeightCm: number;
  maxWeightGrams: number;
}

/** What the customer picks at checkout. `amount` is in the requested charge currency. */
interface ShippingRate {
  rateId: string;
  carrier: ShippingCarrier;
  carrierName: string;
  service: string;
  serviceName: string;
  amount: number;
  estimatedDays: number;
}

interface ShippingQuoteResponse {
  quoteId: string;
  currency: Currency;
  /** ISO timestamp. */
  expiresAt: string;
  rates: ShippingRate[];
}

/** The rate the order froze at checkout. Admin-only: carries what the store pays (`costMxn`). */
interface OrderShippingSelection {
  provider: ShippingProviderName;
  carrier: ShippingCarrier;
  service: string;
  serviceName: string;
  estimatedDays: number;
  /** What the customer was charged for shipping, MXN centavos (0 when free). */
  amountMxn: number;
  /** What the provider quoted us, MXN centavos. */
  costMxn: number;
}

/** What the customer may see of the selection (no cost). */
interface PublicShippingSelection {
  carrier: ShippingCarrier;
  serviceName: string;
  estimatedDays: number;
}

interface OrderLabelAdmin {
  status: ShippingLabelStatus;
  attempts: number;
  lastError?: string;
  trackingNumber?: string;
  carrier?: ShippingCarrier;
  labelUrl?: string;
  trackUrl?: string;
  readyAt?: Date;
  cancelledAt?: Date;
}

export type {
  ShippingOrigin,
  ShippingParcel,
  ShippingParcelSettings,
  ShippingRate,
  ShippingQuoteResponse,
  OrderShippingSelection,
  PublicShippingSelection,
  OrderLabelAdmin,
};
