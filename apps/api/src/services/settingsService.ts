import { AuditAction, AuditModule } from "@gira/shared";
import {
  Settings,
  SINGLETON_KEY,
  type SettingsDocument,
  type ShippingSettings,
  type CurrencySettings,
  type ReservationSettings,
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
  shipping: ShippingSettings;
  currency: CurrencySettings;
  reservation: ReservationSettings;
}

const toPublicSettings = (doc: SettingsDocument): PublicSettings => ({
  id: doc.id as string,
  shipping: doc.shipping,
  currency: doc.currency,
  reservation: doc.reservation,
});

const getSettings = async (): Promise<SettingsDocument> => {
  const existing = await Settings.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $setOnInsert: { key: SINGLETON_KEY } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return existing;
};

const getPublicSettings = async (): Promise<PublicSettings> => toPublicSettings(await getSettings());

const updateShippingSettings = async (
  input: Partial<ShippingSettings>,
  ctx: RequestContext,
): Promise<PublicSettings> => {
  const settings = await getSettings();
  const before = { ...settings.shipping };

  // Explicit field assignment — never spread the payload (anti mass-assignment).
  if (input.nationalFee !== undefined) settings.shipping.nationalFee = input.nationalFee;
  if (input.internationalFee !== undefined) {
    settings.shipping.internationalFee = input.internationalFee;
  }
  if (input.freeShippingThreshold !== undefined) {
    settings.shipping.freeShippingThreshold = input.freeShippingThreshold;
  }

  await settings.save();
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SETTINGS_SHIPPING_UPDATED,
    module: AuditModule.SETTINGS,
    targetId: settings.id as string,
    before,
    after: { ...settings.shipping },
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

export type {
  PublicSettings,
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
};
export {
  getSettings,
  getPublicSettings,
  updateShippingSettings,
  updateCurrencySettings,
  updateReservationSettings,
};
