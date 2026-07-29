import { env } from "../../config/env.js";
import { createStripePaymentProvider } from "./stripePaymentProvider.js";
import { createStubPaymentProvider } from "./stubPaymentProvider.js";
import type { PaymentProvider } from "./types.js";

let cached: PaymentProvider | undefined;

/** Provider chosen by configuration, never by conditionals in business code. */
const getPaymentProvider = (): PaymentProvider => {
  cached ??= env.stripe ? createStripePaymentProvider(env.stripe) : createStubPaymentProvider();
  return cached;
};

export type { CreatePaymentInput, PaymentView, ProviderEvent, PaymentProvider } from "./types.js";
export { ProviderEventType } from "./types.js";
export { getPaymentProvider };
