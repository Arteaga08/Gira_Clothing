import type { Currency } from "../enums/money.js";
import type {
  ShipmentTrackingStatus,
  ShippingCarrier,
  ShippingLabelStatus,
  ShippingProviderName,
} from "../enums/shipping.js";

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

/** Parcel progress mirrored on the order. */
interface OrderTrackingAdmin {
  status: ShipmentTrackingStatus;
  lastEventAt?: Date;
  lastSyncedAt?: Date;
}

interface TrackingEventDto {
  status: ShipmentTrackingStatus;
  /** The provider's own status text, kept for support. */
  rawStatus: string;
  description?: string;
  location?: string;
  occurredAt: Date;
}

/** `GET /admin/orders/:id/tracking`: everything the logistics card of M9b needs. */
interface AdminOrderTracking {
  label?: OrderLabelAdmin;
  tracking?: OrderTrackingAdmin;
  shippedAt?: Date;
  deliveredAt?: Date;
  events: TrackingEventDto[];
}

/** What the OWNING customer sees once the order is shipped (never before). */
interface CustomerShipment {
  carrier: ShippingCarrier;
  carrierName: string;
  trackingNumber: string;
  /** The carrier's own tracking page. */
  trackUrl?: string;
  status?: ShipmentTrackingStatus;
  shippedAt?: Date;
  deliveredAt?: Date;
}

/** `GET /orders/:publicId/tracking`. Shaped from the order; the credential is never echoed back. */
interface PublicTrackingView extends CustomerShipment {
  orderNumber: string;
  events: TrackingEventDto[];
}

export type {
  OrderTrackingAdmin,
  TrackingEventDto,
  AdminOrderTracking,
  CustomerShipment,
  PublicTrackingView,
  ShippingOrigin,
  ShippingParcel,
  ShippingParcelSettings,
  ShippingRate,
  ShippingQuoteResponse,
  OrderShippingSelection,
  PublicShippingSelection,
  OrderLabelAdmin,
};
