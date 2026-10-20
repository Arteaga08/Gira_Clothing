import { vi, type Mock } from "vitest";
import { ShippingProviderName } from "@gira/shared";
import { createStubShippingProvider } from "../../src/adapters/shipping/stubShippingProvider.js";
import {
  __setShippingProviderForTests,
  type ShippingProvider,
} from "../../src/adapters/shipping/index.js";
import { signWebhook } from "../../src/utils/webhookSignature.js";

type FakeShippingProvider = ShippingProvider & {
  getRates: Mock<ShippingProvider["getRates"]>;
  createLabel: Mock<ShippingProvider["createLabel"]>;
  cancelLabel: Mock<ShippingProvider["cancelLabel"]>;
  getTracking: Mock<ShippingProvider["getTracking"]>;
  verifyAndParseWebhook: Mock<ShippingProvider["verifyAndParseWebhook"]>;
};

const FAKE_WEBHOOK_SECRET = "fake_webhook_secret";

/**
 * Wraps the real stub in spies so a test can count calls or force a failure
 * (`fake.createLabel.mockRejectedValueOnce(new ShippingProviderError(...))`).
 * The webhook secret is configured so the endpoint is live; pass `{ webhookSecret: null }`
 * to test the 503 path. Installs itself as the active provider; call
 * `restoreShippingProvider` in afterEach.
 */
const installFakeShippingProvider = (
  options: { webhookSecret?: string | null } = {},
): FakeShippingProvider => {
  const secret = options.webhookSecret === undefined ? FAKE_WEBHOOK_SECRET : options.webhookSecret;
  const stub = createStubShippingProvider({ webhookSecret: secret });
  const fake: FakeShippingProvider = {
    name: ShippingProviderName.STUB,
    acceptsWebhooks: stub.acceptsWebhooks,
    getRates: vi.fn(stub.getRates),
    createLabel: vi.fn(stub.createLabel),
    cancelLabel: vi.fn(stub.cancelLabel),
    getTracking: vi.fn(stub.getTracking),
    verifyAndParseWebhook: vi.fn(stub.verifyAndParseWebhook),
  };
  __setShippingProviderForTests(fake);
  return fake;
};

const restoreShippingProvider = (): void => __setShippingProviderForTests(undefined);

/** Raw body + headers of a signed `tracking.simple` delivery, as the provider would send it. */
const signedTrackingWebhook = (input: {
  trackingNumber: string;
  status: string;
  id?: string;
  createdAt?: string;
  secret?: string;
  timestamp?: string;
  eventType?: string;
}): { body: Buffer; headers: Record<string, string> } => {
  const eventType = input.eventType ?? "tracking.simple";
  const body = Buffer.from(
    JSON.stringify({
      type: eventType,
      created_at: input.createdAt ?? new Date().toISOString(),
      data: {
        tracking_number: input.trackingNumber,
        status: input.status,
        status_description: "Descripción",
        location: "CDMX",
      },
    }),
  );
  const timestamp = input.timestamp ?? String(Date.now());
  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-webhook-event": eventType,
      "x-webhook-id": input.id ?? `evt_${Math.random().toString(36).slice(2)}`,
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signWebhook({
        secret: input.secret ?? FAKE_WEBHOOK_SECRET,
        event: eventType,
        body,
        timestamp,
      }),
    },
  };
};

export type { FakeShippingProvider };
export {
  installFakeShippingProvider,
  restoreShippingProvider,
  signedTrackingWebhook,
  FAKE_WEBHOOK_SECRET,
};
