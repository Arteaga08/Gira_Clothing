import type { Currency, PriceRounding } from "../enums/money.js";

interface ShippingSettings {
  nationalFee: number;
  internationalFee: number;
  freeShippingThreshold: number | null;
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

interface Settings {
  id: string;
  shipping: ShippingSettings;
  currency: CurrencySettings;
  reservation: ReservationSettings;
  inventory: InventorySettings;
}

export type {
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
  InventorySettings,
  Settings,
};
