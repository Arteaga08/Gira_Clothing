import { AuditAction, AuditModule } from "@gira/shared";
import { Types } from "mongoose";
import type {
  PublicOfferBanner,
  PublicStorefrontHero,
  StorefrontAnnouncement,
  StorefrontHero,
  StorefrontOfferBanner,
  ShippingOrigin,
  ShippingParcelSettings,
  ShippingSettings as PublicShippingSettings,
} from "@gira/shared";
import {
  Settings,
  SINGLETON_KEY,
  type SettingsDocument,
  type ShippingSettings,
  type CurrencySettings,
  type ReservationSettings,
  type InventorySettings,
  type TaxSettings,
  type StorefrontSettings,
} from "../models/Settings.js";
import { Product } from "../models/Product.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * Settings singleton access. Each section has its OWN writer
 * (BACKEND_ARCHITECTURE_GUIDELINES, "Documento singleton editable por
 * secciones"): a single PUT replacing the whole document would silently drop a
 * concurrent edit made in another section.
 *
 * `getSettings` upserts on first read, so a fresh deployment always has usable
 * defaults and no endpoint has to handle "settings do not exist yet".
 */

interface PublicSettings {
  id: string;
  shipping: PublicShippingSettings;
  currency: CurrencySettings;
  reservation: ReservationSettings;
  inventory: InventorySettings;
  tax: TaxSettings;
  storefront: { announcement: StorefrontAnnouncement; hero: StorefrontHero; offerBanner: StorefrontOfferBanner };
}

const toAnnouncementView = (doc: SettingsDocument): StorefrontAnnouncement => ({
  enabled: doc.storefront?.announcement?.enabled ?? false,
  messages: [...(doc.storefront?.announcement?.messages ?? [])],
});

const toHeroView = (doc: SettingsDocument): StorefrontHero => ({
  // Explicit mapping: spreading a Mongoose subdocument would leak its internals.
  slides: (doc.storefront?.hero?.slides ?? []).map((slide) => ({
    headline: slide.headline ?? "",
    image: {
      url: slide.image.url,
      publicId: slide.image.publicId,
      width: slide.image.width,
      height: slide.image.height,
    },
    productId: slide.productId ? slide.productId.toString() : null,
    titleColor: slide.titleColor,
    buttonColor: slide.buttonColor,
    cards: slide.cards.map((card) => ({ text: card.text, color: card.color })),
  })),
});

const toOfferBannerView = (doc: SettingsDocument): StorefrontOfferBanner => {
  const banner = doc.storefront?.offerBanner;
  return {
    enabled: banner?.enabled ?? false,
    // Explicit mapping: spreading a Mongoose subdocument would leak its internals.
    image: banner?.image
      ? {
          url: banner.image.url,
          publicId: banner.image.publicId,
          width: banner.image.width,
          height: banner.image.height,
        }
      : null,
    alt: banner?.alt ?? "",
    message: banner?.message ?? "",
    buttonLabel: banner?.buttonLabel ?? "",
    productId: banner?.productId ? banner.productId.toString() : null,
  };
};

const toShippingView = (shipping: ShippingSettings): PublicShippingSettings => ({
  // Explicit mapping: spreading a Mongoose subdocument would leak its internals.
  origin: shipping.origin
    ? {
        name: shipping.origin.name,
        phone: shipping.origin.phone,
        ...(shipping.origin.email ? { email: shipping.origin.email } : {}),
        line1: shipping.origin.line1,
        district: shipping.origin.district,
        city: shipping.origin.city,
        state: shipping.origin.state,
        postalCode: shipping.origin.postalCode,
      }
    : null,
  freeShippingThreshold: shipping.freeShippingThreshold,
  parcel: { ...shipping.parcel },
  quoteTtlMinutes: shipping.quoteTtlMinutes,
});

const toPublicSettings = (doc: SettingsDocument): PublicSettings => ({
  id: doc.id as string,
  shipping: toShippingView(doc.shipping),
  currency: doc.currency,
  reservation: doc.reservation,
  inventory: doc.inventory,
  tax: { rateBps: doc.tax.rateBps },
  storefront: {
    announcement: toAnnouncementView(doc),
    hero: toHeroView(doc),
    offerBanner: toOfferBannerView(doc),
  },
});

const getSettings = async (): Promise<SettingsDocument> => {
  // Plain read first: the upsert below is a write, and it ran on every call
  // although the document exists on every deployment after the first read.
  const current = await Settings.findOne({ key: SINGLETON_KEY });
  if (current) return current;

  const existing = await Settings.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $setOnInsert: { key: SINGLETON_KEY } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return existing;
};

const getPublicSettings = async (): Promise<PublicSettings> => toPublicSettings(await getSettings());

interface UpdateShippingInput {
  origin?: ShippingOrigin;
  freeShippingThreshold?: number | null;
  parcel?: Partial<ShippingParcelSettings>;
  quoteTtlMinutes?: number;
}

const updateShippingSettings = async (
  input: UpdateShippingInput,
  ctx: RequestContext,
): Promise<PublicSettings> => {
  const settings = await getSettings();
  const before = toShippingView(settings.shipping);

  // Explicit field assignment — never spread the payload (anti mass-assignment).
  if (input.origin !== undefined) {
    settings.shipping.origin = {
      name: input.origin.name,
      phone: input.origin.phone,
      ...(input.origin.email ? { email: input.origin.email } : {}),
      line1: input.origin.line1,
      district: input.origin.district,
      city: input.origin.city,
      state: input.origin.state,
      postalCode: input.origin.postalCode,
    };
  }
  if (input.freeShippingThreshold !== undefined) {
    settings.shipping.freeShippingThreshold = input.freeShippingThreshold;
  }
  if (input.parcel !== undefined) {
    const p = input.parcel;
    const target = settings.shipping.parcel;
    if (p.tareGrams !== undefined) target.tareGrams = p.tareGrams;
    if (p.boxLengthCm !== undefined) target.boxLengthCm = p.boxLengthCm;
    if (p.boxWidthCm !== undefined) target.boxWidthCm = p.boxWidthCm;
    if (p.boxHeightCm !== undefined) target.boxHeightCm = p.boxHeightCm;
    if (p.extraUnitHeightCm !== undefined) target.extraUnitHeightCm = p.extraUnitHeightCm;
    if (p.maxWeightGrams !== undefined) target.maxWeightGrams = p.maxWeightGrams;
  }
  if (input.quoteTtlMinutes !== undefined) {
    settings.shipping.quoteTtlMinutes = input.quoteTtlMinutes;
  }

  await settings.save();
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SETTINGS_SHIPPING_UPDATED,
    module: AuditModule.SETTINGS,
    targetId: settings.id as string,
    before: { ...before },
    after: { ...toShippingView(settings.shipping) },
    ip: ctx.ip,
  });

  return toPublicSettings(settings);
};

const updateCurrencySettings = async (
  input: Partial<CurrencySettings>,
  ctx: RequestContext,
): Promise<PublicSettings> => {
  const settings = await getSettings();
  const before = { ...settings.currency };

  if (input.mxnPerUsdCents !== undefined) settings.currency.mxnPerUsdCents = input.mxnPerUsdCents;
  if (input.rounding !== undefined) settings.currency.rounding = input.rounding;
  if (input.supported !== undefined) settings.currency.supported = input.supported;

  await settings.save();
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SETTINGS_CURRENCY_UPDATED,
    module: AuditModule.SETTINGS,
    targetId: settings.id as string,
    before,
    after: { ...settings.currency },
    ip: ctx.ip,
  });

  return toPublicSettings(settings);
};

const updateReservationSettings = async (
  input: Partial<ReservationSettings>,
  ctx: RequestContext,
): Promise<PublicSettings> => {
  const settings = await getSettings();
  const before = { ...settings.reservation };

  if (input.ttlMinutes !== undefined) settings.reservation.ttlMinutes = input.ttlMinutes;
  if (input.cartInactivityDays !== undefined) {
    settings.reservation.cartInactivityDays = input.cartInactivityDays;
  }

  await settings.save();
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SETTINGS_RESERVATION_UPDATED,
    module: AuditModule.SETTINGS,
    targetId: settings.id as string,
    before,
    after: { ...settings.reservation },
    ip: ctx.ip,
  });

  return toPublicSettings(settings);
};

const updateInventorySettings = async (
  input: Partial<InventorySettings>,
  ctx: RequestContext,
): Promise<PublicSettings> => {
  const settings = await getSettings();
  const before = { ...settings.inventory };

  if (input.lowStockThreshold !== undefined) {
    settings.inventory.lowStockThreshold = input.lowStockThreshold;
  }

  await settings.save();
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SETTINGS_INVENTORY_UPDATED,
    module: AuditModule.SETTINGS,
    targetId: settings.id as string,
    before,
    after: { ...settings.inventory },
    ip: ctx.ip,
  });

  return toPublicSettings(settings);
};

/**
 * IVA rate for orders created from now on. Orders freeze `taxRateBps` at
 * creation, so this never rewrites an existing order; and since catalog
 * prices already include IVA it changes the tax breakdown, never the total.
 */
const updateTaxSettings = async (input: TaxSettings, ctx: RequestContext): Promise<PublicSettings> => {
  const settings = await getSettings();
  const before = { rateBps: settings.tax.rateBps };

  settings.tax.rateBps = input.rateBps;

  await settings.save();
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SETTINGS_TAX_UPDATED,
    module: AuditModule.SETTINGS,
    targetId: settings.id as string,
    before,
    after: { rateBps: settings.tax.rateBps },
    ip: ctx.ip,
  });

  return toPublicSettings(settings);
};

/**
 * What the storefront may read without a session: the marquee and nothing
 * else from the singleton. Hidden or empty collapses to `enabled: false`.
 */
const getPublicAnnouncement = async (): Promise<StorefrontAnnouncement> => {
  const view = toAnnouncementView(await getSettings());
  return view.enabled && view.messages.length > 0 ? view : { enabled: false, messages: [] };
};

const updateAnnouncementSettings = async (
  input: StorefrontAnnouncement,
  ctx: RequestContext,
): Promise<PublicSettings> => {
  const settings = await getSettings();
  const before = { ...toAnnouncementView(settings) };

  settings.storefront.announcement.enabled = input.enabled;
  settings.storefront.announcement.messages = [...input.messages];

  await settings.save();
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SETTINGS_ANNOUNCEMENT_UPDATED,
    module: AuditModule.SETTINGS,
    targetId: settings.id as string,
    before,
    after: { ...toAnnouncementView(settings) },
    ip: ctx.ip,
  });

  return toPublicSettings(settings);
};

const HERO_PRODUCT_INVALID = "Uno de los productos elegidos no existe o está retirado.";
const OFFER_PRODUCT_INVALID = "El producto elegido no existe o está retirado.";

/**
 * What the storefront may read of the hero: the photos, their colours and
 * cards, and the slug and name of each model. A model that was retired since
 * the hero was saved collapses to `product: null` (the button then leads to the
 * shop) instead of leaving a dead link.
 */
const getPublicHero = async (): Promise<PublicStorefrontHero> => {
  const hero = toHeroView(await getSettings());
  const ids = [...new Set(hero.slides.flatMap((slide) => (slide.productId ? [slide.productId] : [])))];
  const products = ids.length
    ? await Product.find({ _id: { $in: ids }, isActive: true }).select("slug name").lean()
    : [];
  const byId = new Map(products.map((product) => [String(product._id), { slug: product.slug, name: product.name }]));

  return {
    slides: hero.slides.map((slide) => ({
      headline: slide.headline,
      image: { url: slide.image.url, width: slide.image.width, height: slide.image.height },
      product: slide.productId ? (byId.get(slide.productId) ?? null) : null,
      titleColor: slide.titleColor,
      buttonColor: slide.buttonColor,
      cards: slide.cards,
    })),
  };
};

const updateHeroSettings = async (input: StorefrontHero, ctx: RequestContext): Promise<PublicSettings> => {
  const ids = [...new Set(input.slides.flatMap((slide) => (slide.productId ? [slide.productId] : [])))];
  if (ids.length > 0 && (await Product.countDocuments({ _id: { $in: ids }, isActive: true })) !== ids.length) {
    throw new AppError(HERO_PRODUCT_INVALID, 400);
  }

  const settings = await getSettings();
  const before = { ...toHeroView(settings) };

  settings.storefront.hero.slides = input.slides.map((slide) => ({
    headline: slide.headline,
    image: { ...slide.image },
    productId: slide.productId ? new Types.ObjectId(slide.productId) : null,
    titleColor: slide.titleColor,
    buttonColor: slide.buttonColor,
    cards: slide.cards.map((card) => ({ ...card })),
  }));

  await settings.save();
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SETTINGS_HERO_UPDATED,
    module: AuditModule.SETTINGS,
    targetId: settings.id as string,
    before,
    after: { ...toHeroView(settings) },
    ip: ctx.ip,
  });

  return toPublicSettings(settings);
};

/**
 * What the storefront may read of the offer banner. Hidden, or saved half
 * filled, it collapses to null and the home skips it. A model retired since
 * the banner was saved collapses to `product: null` (the button then leads to
 * the shop), like the hero's.
 */
const getPublicOfferBanner = async (): Promise<PublicOfferBanner | null> => {
  const { enabled, image, alt, message, buttonLabel, productId } = toOfferBannerView(await getSettings());
  if (!enabled || !image || !alt || !message || !buttonLabel) return null;
  const product = productId
    ? await Product.findOne({ _id: productId, isActive: true }).select("slug name").lean()
    : null;
  return {
    image: { url: image.url, width: image.width, height: image.height },
    alt,
    message,
    buttonLabel,
    product: product ? { slug: product.slug, name: product.name } : null,
  };
};

const updateOfferBannerSettings = async (
  input: StorefrontOfferBanner,
  ctx: RequestContext,
): Promise<PublicSettings> => {
  if (input.productId && !(await Product.exists({ _id: input.productId, isActive: true }))) {
    throw new AppError(OFFER_PRODUCT_INVALID, 400);
  }

  const settings = await getSettings();
  const before = { ...toOfferBannerView(settings) };

  settings.storefront.offerBanner = {
    enabled: input.enabled,
    image: input.image ? { ...input.image } : null,
    alt: input.alt,
    message: input.message,
    buttonLabel: input.buttonLabel,
    productId: input.productId ? new Types.ObjectId(input.productId) : null,
  };

  await settings.save();
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SETTINGS_OFFER_BANNER_UPDATED,
    module: AuditModule.SETTINGS,
    targetId: settings.id as string,
    before,
    after: { ...toOfferBannerView(settings) },
    ip: ctx.ip,
  });

  return toPublicSettings(settings);
};

export type {
  PublicSettings,
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
  InventorySettings,
  TaxSettings,
  StorefrontSettings,
};
export {
  getSettings,
  getPublicSettings,
  updateShippingSettings,
  updateCurrencySettings,
  updateReservationSettings,
  updateInventorySettings,
  updateTaxSettings,
  updateAnnouncementSettings,
  getPublicAnnouncement,
  updateHeroSettings,
  getPublicHero,
  updateOfferBannerSettings,
  getPublicOfferBanner,
};
