import type { Currency, PriceRounding } from "../enums/money.js";
import type { ShippingOrigin, ShippingParcelSettings } from "./shipping.js";

interface ShippingSettings {
  /** null until the owner fills it in Ajustes: quoting and labels stay disabled. */
  origin: ShippingOrigin | null;
  freeShippingThreshold: number | null;
  parcel: ShippingParcelSettings;
  quoteTtlMinutes: number;
}

interface CurrencySettings {
  mxnPerUsdCents: number;
  rounding: PriceRounding;
  supported: Currency[];
}

interface ReservationSettings {
  ttlMinutes: number;
  cartInactivityDays: number;
}

interface InventorySettings {
  lowStockThreshold: number;
}

interface TaxSettings {
  /** IVA already included in catalog prices, in basis points (1600 = 16%). */
  rateBps: number;
}

/** Marquee above the storefront navbar, edited in Ajustes. */
interface StorefrontAnnouncement {
  enabled: boolean;
  messages: string[];
}

interface StorefrontSettings {
  announcement: StorefrontAnnouncement;
}

interface Settings {
  id: string;
  shipping: ShippingSettings;
  currency: CurrencySettings;
  reservation: ReservationSettings;
  inventory: InventorySettings;
  tax: TaxSettings;
  storefront: StorefrontSettings;
}

export type {
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
  InventorySettings,
  TaxSettings,
  StorefrontAnnouncement,
  StorefrontSettings,
  Settings,
};
