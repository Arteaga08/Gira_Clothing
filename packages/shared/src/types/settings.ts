import type { Currency, PriceRounding } from "../enums/money.js";
import type { ImageAttrs } from "./order.js";
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

type HeroSurfaceColor = "bone" | "pink" | "lilac" | "mint";
type HeroButtonColor = "yellow" | "pink" | "lilac" | "mint";

/** Floating card beside the photo; each photo carries its own. */
interface HeroCard {
  text: string;
  color: HeroSurfaceColor;
}

interface HeroSlide {
  /** At most three words; empty falls back to the brand name. */
  headline: string;
  image: ImageAttrs;
  /** The model the photo and its button lead to. null: the button leads to the shop. */
  productId: string | null;
  titleColor: HeroSurfaceColor;
  buttonColor: HeroButtonColor;
  cards: HeroCard[];
}

/** Hero of the storefront home, edited in «Contenido de home». */
interface StorefrontHero {
  slides: HeroSlide[];
}

/** What the public storefront may read of a hero slide: no ids, no publicId. */
interface PublicHeroSlide {
  headline: string;
  image: Pick<ImageAttrs, "url" | "width" | "height">;
  /** null when the model was retired or removed: the button leads to the shop. */
  product: { slug: string; name: string } | null;
  titleColor: HeroSurfaceColor;
  buttonColor: HeroButtonColor;
  cards: HeroCard[];
}

interface PublicStorefrontHero {
  slides: PublicHeroSlide[];
}

/**
 * Offer banner of the home, edited in «Contenido de home». Hidden, it may be
 * left half filled; shown, every field is required.
 */
interface StorefrontOfferBanner {
  enabled: boolean;
  image: ImageAttrs | null;
  /** Describes the photo for screen readers. */
  alt: string;
  /** The phrase that loops over the photo. */
  message: string;
  buttonLabel: string;
  /** The model the button leads to. null: the button leads to the shop. */
  productId: string | null;
}

/** What the public storefront may read of the banner: no ids, no publicId, no switch. */
interface PublicOfferBanner {
  image: Pick<ImageAttrs, "url" | "width" | "height">;
  alt: string;
  message: string;
  buttonLabel: string;
  /** null when no model was chosen, or it was retired since: the button leads to the shop. */
  product: { slug: string; name: string } | null;
}

interface StorefrontSettings {
  announcement: StorefrontAnnouncement;
  hero: StorefrontHero;
  offerBanner: StorefrontOfferBanner;
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
  HeroSurfaceColor,
  HeroButtonColor,
  HeroCard,
  HeroSlide,
  StorefrontHero,
  PublicHeroSlide,
  PublicStorefrontHero,
  StorefrontOfferBanner,
  PublicOfferBanner,
  StorefrontSettings,
  Settings,
};
