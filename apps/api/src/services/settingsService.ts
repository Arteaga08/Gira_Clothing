import { AuditAction, AuditModule } from "@gira/shared";
import type {
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
} from "../models/Settings.js";
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
}

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

export type {
  PublicSettings,
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
  InventorySettings,
  TaxSettings,
};
export {
  getSettings,
  getPublicSettings,
  updateShippingSettings,
  updateCurrencySettings,
  updateReservationSettings,
  updateInventorySettings,
  updateTaxSettings,
};
