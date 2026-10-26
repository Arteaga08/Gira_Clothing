import type { Settings, ShippingOrigin, ShippingParcelSettings, StorefrontAnnouncement, StorefrontHero, StorefrontOfferBanner, Wire } from "@gira/shared";
import { browserRequest } from "./browser";
import { ADMIN_SETTINGS_PATH } from "./paths";
import { expectData, type ApiResult } from "./request";

/**
 * Browser-side client for /admin/settings. Each section has its own PATCH on
 * the API, so saving one never overwrites a concurrent edit of another.
 */

interface ShippingSettingsBody {
  origin: ShippingOrigin;
  freeShippingThreshold: number | null;
  parcel: ShippingParcelSettings;
  quoteTtlMinutes: number;
}

interface SettingsClient {
  get: () => Promise<Wire<Settings>>;
  updateTax: (rateBps: number) => Promise<Wire<Settings>>;
  updateShipping: (body: ShippingSettingsBody) => Promise<Wire<Settings>>;
  updateAnnouncement: (body: StorefrontAnnouncement) => Promise<Wire<Settings>>;
  updateHero: (body: StorefrontHero) => Promise<Wire<Settings>>;
  updateOfferBanner: (body: StorefrontOfferBanner) => Promise<Wire<Settings>>;
}

const settingsOf = async (call: Promise<ApiResult<{ settings: Settings }>>): Promise<Wire<Settings>> =>
  expectData(await call).settings;

const settingsClient: SettingsClient = {
  get: () => settingsOf(browserRequest(ADMIN_SETTINGS_PATH)),
  updateTax: (rateBps) =>
    settingsOf(browserRequest(`${ADMIN_SETTINGS_PATH}/tax`, { method: "PATCH", body: { rateBps } })),
  updateShipping: (body) =>
    settingsOf(browserRequest(`${ADMIN_SETTINGS_PATH}/shipping`, { method: "PATCH", body })),
  updateAnnouncement: (body) =>
    settingsOf(browserRequest(`${ADMIN_SETTINGS_PATH}/announcement`, { method: "PATCH", body })),
  updateHero: (body) =>
    settingsOf(browserRequest(`${ADMIN_SETTINGS_PATH}/hero`, { method: "PATCH", body })),
  updateOfferBanner: (body) =>
    settingsOf(browserRequest(`${ADMIN_SETTINGS_PATH}/offer-banner`, { method: "PATCH", body })),
};

export type { SettingsClient, ShippingSettingsBody };
export { settingsClient };
