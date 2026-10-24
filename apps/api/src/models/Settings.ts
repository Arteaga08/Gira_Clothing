import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import {
  ANNOUNCEMENT_MAX_LENGTH,
  ANNOUNCEMENT_MAX_MESSAGES,
  Currency,
  DEFAULT_TAX_RATE_BPS,
  HERO_BUTTON_COLORS,
  HERO_CARD_MAX_LENGTH,
  HERO_HEADLINE_MAX_LENGTH,
  HERO_MAX_CARDS,
  HERO_MAX_SLIDES,
  HERO_SURFACE_COLORS,
  PriceRounding,
} from "@gira/shared";
import type {
  HeroButtonColor,
  HeroCard,
  HeroSurfaceColor,
  ImageAttrs,
  ShippingOrigin,
  ShippingParcelSettings,
} from "@gira/shared";

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
  /** undefined until the owner fills it in Ajustes: quoting and labels stay disabled. */
  origin?: ShippingOrigin;
  /** null disables free shipping entirely. Compared against the MXN subtotal. */
  freeShippingThreshold: number | null;
  parcel: ShippingParcelSettings;
  /** How long a quote stays valid at checkout. */
  quoteTtlMinutes: number;
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

interface InventorySettings {
  /** Available units at or below this count show up as "low stock" in the panel. */
  lowStockThreshold: number;
}

interface TaxSettings {
  /** IVA already included in catalog prices, in basis points (1600 = 16%). */
  rateBps: number;
}

interface HeroSlideAttrs {
  image: ImageAttrs;
  /** null: the slide's button leads to the shop instead of a model. */
  productId: Types.ObjectId | null;
  titleColor: HeroSurfaceColor;
  buttonColor: HeroButtonColor;
  cards: HeroCard[];
}

interface StorefrontSettings {
  announcement: {
    enabled: boolean;
    messages: string[];
  };
  hero: {
    headline: string;
    slides: HeroSlideAttrs[];
  };
}

interface SettingsAttrs {
  key: string;
  shipping: ShippingSettings;
  currency: CurrencySettings;
  reservation: ReservationSettings;
  inventory: InventorySettings;
  tax: TaxSettings;
  storefront: StorefrontSettings;
}

type SettingsModel = Model<SettingsAttrs>;
type SettingsDocument = HydratedDocument<SettingsAttrs>;

const heroImageSchema = new Schema<ImageAttrs>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const heroCardSchema = new Schema<HeroCard>(
  {
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: HERO_CARD_MAX_LENGTH },
    color: { type: String, enum: HERO_SURFACE_COLORS, required: true },
  },
  { _id: false },
);

const heroSlideSchema = new Schema<HeroSlideAttrs>(
  {
    image: { type: heroImageSchema, required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    titleColor: { type: String, enum: HERO_SURFACE_COLORS, required: true },
    buttonColor: { type: String, enum: HERO_BUTTON_COLORS, required: true },
    cards: {
      type: [heroCardSchema],
      default: () => [],
      validate: {
        validator: (v: HeroCard[]) => v.length <= HERO_MAX_CARDS,
        message: `Máximo ${HERO_MAX_CARDS} cards por foto.`,
      },
    },
  },
  { _id: false },
);

const settingsSchema = new Schema<SettingsAttrs, SettingsModel>(
  {
    key: { type: String, required: true, unique: true, default: SINGLETON_KEY },
    shipping: {
      origin: {
        type: new Schema(
          {
            name: { type: String, required: true, trim: true, maxlength: 120 },
            phone: { type: String, required: true, trim: true },
            email: { type: String, trim: true, lowercase: true },
            line1: { type: String, required: true, trim: true, maxlength: 200 },
            district: { type: String, required: true, trim: true, maxlength: 120 },
            city: { type: String, required: true, trim: true, maxlength: 120 },
            state: { type: String, required: true, trim: true },
            postalCode: { type: String, required: true, trim: true },
          },
          { _id: false },
        ),
      },
      freeShippingThreshold: { type: Number, min: 0, default: null },
      parcel: {
        tareGrams: { type: Number, required: true, min: 0, max: 5_000, default: 150 },
        boxLengthCm: { type: Number, required: true, min: 1, max: 200, default: 30 },
        boxWidthCm: { type: Number, required: true, min: 1, max: 200, default: 25 },
        boxHeightCm: { type: Number, required: true, min: 1, max: 200, default: 5 },
        extraUnitHeightCm: { type: Number, required: true, min: 0, max: 100, default: 3 },
        maxWeightGrams: { type: Number, required: true, min: 1, max: 70_000, default: 20_000 },
      },
      quoteTtlMinutes: { type: Number, required: true, min: 5, max: 240, default: 30 },
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
    inventory: {
      lowStockThreshold: {
        type: Number,
        required: true,
        min: 0,
        max: 1000,
        validate: { validator: Number.isInteger, message: "El umbral debe ser un entero." },
        default: 3,
      },
    },
    tax: {
      rateBps: {
        type: Number,
        required: true,
        min: 0,
        max: 10000,
        validate: { validator: Number.isInteger, message: "La tasa debe ser un entero en puntos base." },
        default: DEFAULT_TAX_RATE_BPS,
      },
    },
    storefront: {
      announcement: {
        enabled: { type: Boolean, default: false },
        messages: {
          type: [{ type: String, trim: true, minlength: 1, maxlength: ANNOUNCEMENT_MAX_LENGTH }],
          default: () => [],
          validate: {
            validator: (v: string[]) => v.length <= ANNOUNCEMENT_MAX_MESSAGES,
            message: `Máximo ${ANNOUNCEMENT_MAX_MESSAGES} mensajes.`,
          },
        },
      },
      hero: {
        headline: { type: String, trim: true, maxlength: HERO_HEADLINE_MAX_LENGTH, default: "" },
        slides: {
          type: [heroSlideSchema],
          default: () => [],
          validate: {
            validator: (v: HeroSlideAttrs[]) => v.length <= HERO_MAX_SLIDES,
            message: `Máximo ${HERO_MAX_SLIDES} fotos.`,
          },
        },
      },
    },
  },
  { timestamps: true },
);

const Settings = model<SettingsAttrs, SettingsModel>("Settings", settingsSchema);

export type {
  HeroSlideAttrs,
  SettingsAttrs,
  SettingsDocument,
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
  InventorySettings,
  TaxSettings,
  StorefrontSettings,
};
export { Settings, SINGLETON_KEY };
