import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { Currency, PriceRounding } from "@gira/shared";

/**
 * Business configuration singleton (ECOMMERCE_ARCHITECTURE_GUIDELINES,
 * "Configuración de negocio centralizada"). Exactly one document, pinned by a
 * unique `key`. Designed to GROW ADDITIVELY: a future feature adds its own
 * section here instead of spawning another settings model.
 *
 * Once this exists, no business threshold may be hardcoded anywhere else.
 * All money is MXN centavos (integers).
 */

const SINGLETON_KEY = "global";

interface ShippingSettings {
  nationalFee: number;
  internationalFee: number;
  /** null disables free shipping entirely. Compared against the MXN subtotal. */
  freeShippingThreshold: number | null;
}

interface CurrencySettings {
  /** MXN centavos per 1 USD. 1785 == 17.85 MXN/USD. Integer, never a float. */
  mxnPerUsdCents: number;
  rounding: PriceRounding;
  /** Currencies the storefront may charge in. MXN is always allowed. */
  supported: Currency[];
}

interface ReservationSettings {
  /** How long stock stays held while the customer pays. */
  ttlMinutes: number;
  /** Idle days before an abandoned logged-in cart is dropped by the TTL index. */
  cartInactivityDays: number;
}

interface SettingsAttrs {
  key: string;
  shipping: ShippingSettings;
  currency: CurrencySettings;
  reservation: ReservationSettings;
}

type SettingsModel = Model<SettingsAttrs>;
type SettingsDocument = HydratedDocument<SettingsAttrs>;

const settingsSchema = new Schema<SettingsAttrs, SettingsModel>(
  {
    key: { type: String, required: true, unique: true, default: SINGLETON_KEY },
    shipping: {
      nationalFee: {
        type: Number,
        required: true,
        min: 0,
        validate: { validator: Number.isInteger, message: "La tarifa debe ser un entero." },
        default: 15000,
      },
      internationalFee: {
        type: Number,
        required: true,
        min: 0,
        validate: { validator: Number.isInteger, message: "La tarifa debe ser un entero." },
        default: 60000,
      },
      freeShippingThreshold: { type: Number, min: 0, default: null },
    },
    currency: {
      mxnPerUsdCents: { type: Number, required: true, min: 1, default: 1800 },
      rounding: {
        type: String,
        enum: Object.values(PriceRounding),
        default: PriceRounding.UP_TO_50_CENTS,
      },
      supported: {
        type: [String],
        enum: Object.values(Currency),
        default: () => [Currency.MXN, Currency.USD],
      },
    },
    reservation: {
      ttlMinutes: { type: Number, required: true, min: 1, max: 1440, default: 30 },
      cartInactivityDays: { type: Number, required: true, min: 1, max: 365, default: 30 },
    },
  },
  { timestamps: true },
);

const Settings = model<SettingsAttrs, SettingsModel>("Settings", settingsSchema);

export type {
  SettingsAttrs,
  SettingsDocument,
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
};
export { Settings, SINGLETON_KEY };
