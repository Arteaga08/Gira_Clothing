import type { ShippingCarrier, ShippingOrigin, ShippingParcel, ShippingProviderName } from "@gira/shared";

/**
 * Narrow, domain-owned port (BACKEND_ARCHITECTURE_GUIDELINES, "Integraciones
 * externas"): money is MXN centavos, carriers are OUR closed list, errors are
 * Spanish. Nothing carrying a provider's vocabulary leaves its adapter file.
 */

interface ShippingDestination {
  name: string;
  phone: string;
  email?: string;
  line1: string;
  line2?: string;
  district: string;
  city: string;
  /** Code from MEXICAN_STATES. */
  state: string;
  postalCode: string;
}

interface RatesInput {
  origin: ShippingOrigin;
  destination: ShippingDestination;
  parcel: ShippingParcel;
  /** Goods value, MXN centavos (insurance / declared value). */
  declaredValueMxn: number;
}

interface ProviderRate {
  carrier: ShippingCarrier;
  /** Provider service code, needed again to buy the label. */
  service: string;
  serviceName: string;
  costMxn: number;
  estimatedDays: number;
}

interface CreateLabelInput extends RatesInput {
  /** Our human folio, sent as a reference on the label. */
  orderRef: string;
  carrier: ShippingCarrier;
  service: string;
}

interface LabelResult {
  providerShipmentId: string;
  trackingNumber: string;
  carrier: ShippingCarrier;
  labelUrl: string;
  trackUrl: string;
  costMxn: number;
}

interface CancelLabelInput {
  carrier: ShippingCarrier;
  trackingNumber: string;
}

interface CallOptions {
  /** Aborts the call (used by tests; adapters also enforce their own deadlines). */
  signal?: AbortSignal;
}

interface ShippingProvider {
  readonly name: ShippingProviderName;
  getRates(input: RatesInput, options: CallOptions): Promise<ProviderRate[]>;
  createLabel(input: CreateLabelInput, options: CallOptions): Promise<LabelResult>;
  cancelLabel(input: CancelLabelInput, options: CallOptions): Promise<void>;
}

/**
 * - rejected: the provider refused (bad address, no balance, not cancellable).
 *   Nothing was created; retrying the same input will not help until it changes.
 * - unavailable: the call did not go through (rate limit, provider down on a
 *   QUOTE). Safe to retry.
 * - unknown_outcome: the purchase may or may not have happened (timeout / 5xx on
 *   createLabel). The provider has no idempotency key, so this is NEVER retried
 *   automatically.
 */
type ShippingProviderErrorKind = "rejected" | "unavailable" | "unknown_outcome";

class ShippingProviderError extends Error {
  public readonly kind: ShippingProviderErrorKind;

  constructor(kind: ShippingProviderErrorKind, message: string) {
    super(message);
    this.kind = kind;
    Object.setPrototypeOf(this, ShippingProviderError.prototype);
  }
}

export type {
  ShippingDestination,
  RatesInput,
  ProviderRate,
  CreateLabelInput,
  LabelResult,
  CancelLabelInput,
  CallOptions,
  ShippingProvider,
  ShippingProviderErrorKind,
};
export { ShippingProviderError };
