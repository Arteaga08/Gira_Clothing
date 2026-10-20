import { env } from "../../config/env.js";
import { createEnviaShippingProvider } from "./enviaShippingProvider.js";
import { createStubShippingProvider } from "./stubShippingProvider.js";
import type { ShippingProvider } from "./types.js";

let cached: ShippingProvider | undefined;
let override: ShippingProvider | undefined;

/** Provider chosen by configuration, never by conditionals in business code. */
const getShippingProvider = (): ShippingProvider => {
  if (override) return override;
  cached ??= env.envia
    ? createEnviaShippingProvider(env.envia)
    : createStubShippingProvider({ webhookSecret: env.stubShippingWebhookSecret });
  return cached;
};

/** Tests inject a controllable provider; pass undefined to restore the configured one. */
const __setShippingProviderForTests = (provider: ShippingProvider | undefined): void => {
  override = provider;
};

export type {
  ShippingDestination,
  RatesInput,
  ProviderRate,
  CreateLabelInput,
  LabelResult,
  CancelLabelInput,
  CallOptions,
  TrackingEvent,
  WebhookHeaders,
  ParsedWebhook,
  ShippingProvider,
} from "./types.js";
export { ShippingProviderError } from "./types.js";
export { getShippingProvider, __setShippingProviderForTests };
