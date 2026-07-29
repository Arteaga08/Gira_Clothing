import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { Currency, PaymentStatus } from "@gira/shared";

const { mockCreate, mockRetrieve, mockRefundCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockRetrieve: vi.fn(),
  mockRefundCreate: vi.fn(),
}));

// Only paymentIntents/refunds are mocked (no network in tests). `webhooks` is
// the REAL Stripe module — signature verification is pure crypto and needs no
// network, so testing it for real (not with a hand-rolled fake) is both safe
// and the only way to trust it.
vi.mock("stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stripe")>();
  class MockStripe {
    paymentIntents = { create: mockCreate, retrieve: mockRetrieve };
    refunds = { create: mockRefundCreate };
    webhooks: InstanceType<typeof actual.default>["webhooks"];
    constructor(key: string) {
      this.webhooks = new actual.default(key).webhooks;
    }
  }
  return { default: MockStripe };
});

const { createStripePaymentProvider } = await import(
  "../../src/adapters/payment/stripePaymentProvider.js"
);
const { createStubPaymentProvider } = await import(
  "../../src/adapters/payment/stubPaymentProvider.js"
);
const { getPaymentProvider } = await import("../../src/adapters/payment/index.js");
const { ProviderEventType } = await import("../../src/adapters/payment/types.js");
const RealStripe = (await import("stripe")).default;

const CONFIG = {
  secretKey: "sk_test_fake",
  webhookSecret: "whsec_fake",
  webhookToleranceSeconds: 300,
};

beforeEach(() => {
  mockCreate.mockReset();
  mockRetrieve.mockReset();
  mockRefundCreate.mockReset();
});

describe("stripePaymentProvider · createPayment", () => {
  it("manda amount, currency, metadata e idempotencyKey al SDK", async () => {
    mockCreate.mockResolvedValue({
      id: "pi_1",
      status: "requires_payment_method",
      amount: 5000,
      currency: "mxn",
      client_secret: "pi_1_secret",
    });
    const provider = createStripePaymentProvider(CONFIG);

    await provider.createPayment({
      amount: 5000,
      currency: Currency.MXN,
      idempotencyKey: "key-1",
      metadata: { orderId: "o1", publicId: "p1" },
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        currency: "mxn",
        metadata: { orderId: "o1", publicId: "p1" },
      }),
      { idempotencyKey: "key-1" },
    );
  });

  it("mapea el estado del SDK a PaymentStatus del dominio", async () => {
    mockCreate.mockResolvedValue({
      id: "pi_2",
      status: "succeeded",
      amount: 1000,
      currency: "usd",
      client_secret: "pi_2_secret",
    });
    const provider = createStripePaymentProvider(CONFIG);

    const result = await provider.createPayment({
      amount: 1000,
      currency: Currency.USD,
      idempotencyKey: "key-2",
      metadata: { orderId: "o2", publicId: "p2" },
    });

    expect(result.status).toBe(PaymentStatus.SUCCEEDED);
    expect(result.providerId).toBe("pi_2");
    expect(result.currency).toBe("USD");
    expect(result.clientSecret).toBe("pi_2_secret");
  });

  it("convierte un error del SDK en AppError 502", async () => {
    mockCreate.mockRejectedValue(new Error("network down"));
    const provider = createStripePaymentProvider(CONFIG);

    await expect(
      provider.createPayment({
        amount: 1000,
        currency: Currency.MXN,
        idempotencyKey: "key-3",
        metadata: { orderId: "o3", publicId: "p3" },
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("stripePaymentProvider · getPayment / refundPayment", () => {
  it("getPayment mapea el intent recuperado", async () => {
    mockRetrieve.mockResolvedValue({
      id: "pi_4",
      status: "processing",
      amount: 2000,
      currency: "mxn",
    });
    const provider = createStripePaymentProvider(CONFIG);
    const result = await provider.getPayment("pi_4");
    expect(result.status).toBe(PaymentStatus.PROCESSING);
  });

  it("getPayment convierte un error del SDK en AppError 502", async () => {
    mockRetrieve.mockRejectedValue(new Error("not found"));
    const provider = createStripePaymentProvider(CONFIG);
    await expect(provider.getPayment("pi_missing")).rejects.toMatchObject({ statusCode: 502 });
  });

  it("refundPayment manda payment_intent y amount opcional al SDK", async () => {
    mockRefundCreate.mockResolvedValue({ id: "re_1" });
    const provider = createStripePaymentProvider(CONFIG);
    await provider.refundPayment("pi_5", 500);
    expect(mockRefundCreate).toHaveBeenCalledWith({ payment_intent: "pi_5", amount: 500 });
  });

  it("refundPayment convierte un error del SDK en AppError 502", async () => {
    mockRefundCreate.mockRejectedValue(new Error("boom"));
    const provider = createStripePaymentProvider(CONFIG);
    await expect(provider.refundPayment("pi_6")).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("stripePaymentProvider · parseWebhookEvent", () => {
  const provider = createStripePaymentProvider(CONFIG);

  const sign = (payload: string, timestamp?: number): string =>
    new RealStripe(CONFIG.secretKey).webhooks.generateTestHeaderString({
      payload,
      secret: CONFIG.webhookSecret,
      ...(timestamp !== undefined ? { timestamp } : {}),
    });

  it("acepta una firma válida y mapea el tipo payment_intent.succeeded", () => {
    const payload = JSON.stringify({
      id: "evt_1",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_1", metadata: { orderId: "o1" } } },
    });
    const event = provider.parseWebhookEvent(Buffer.from(payload), sign(payload));
    expect(event).toMatchObject({
      id: "evt_1",
      type: ProviderEventType.PAYMENT_SUCCEEDED,
      paymentId: "pi_1",
      orderId: "o1",
    });
  });

  it("rechaza una firma inválida con 400", () => {
    const payload = JSON.stringify({ id: "evt_bad", type: "payment_intent.succeeded", data: { object: {} } });
    expect(() =>
      provider.parseWebhookEvent(Buffer.from(payload), "t=1700000000,v1=deadbeef"),
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it("rechaza un evento fuera de la tolerancia de timestamp (replay) con 400", () => {
    const payload = JSON.stringify({
      id: "evt_2",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_2" } },
    });
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(() => provider.parseWebhookEvent(Buffer.from(payload), sign(payload, old))).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it("mapea un tipo no manejado a IGNORED en vez de lanzar", () => {
    const payload = JSON.stringify({ id: "evt_3", type: "customer.created", data: { object: { id: "cus_1" } } });
    const event = provider.parseWebhookEvent(Buffer.from(payload), sign(payload));
    expect(event.type).toBe(ProviderEventType.IGNORED);
  });

  it("rechaza un body alterado aunque la firma sea de un payload válido", () => {
    const payload = JSON.stringify({ id: "evt_4", type: "payment_intent.succeeded", data: { object: {} } });
    const signature = sign(payload);
    const tampered = payload.replace("evt_4", "evt_HACKED");
    expect(() => provider.parseWebhookEvent(Buffer.from(tampered), signature)).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it("mapea charge.refunded resolviendo el payment_intent referenciado", () => {
    const payload = JSON.stringify({
      id: "evt_5",
      type: "charge.refunded",
      data: { object: { id: "ch_1", payment_intent: "pi_5", metadata: { orderId: "o5" } } },
    });
    const event = provider.parseWebhookEvent(Buffer.from(payload), sign(payload));
    expect(event).toMatchObject({
      type: ProviderEventType.PAYMENT_REFUNDED,
      paymentId: "pi_5",
      orderId: "o5",
    });
  });

  it("mapea charge.dispute.closed ganada/perdida según el status del payload", () => {
    const won = JSON.stringify({
      id: "evt_6",
      type: "charge.dispute.closed",
      data: { object: { id: "dp_1", status: "won", payment_intent: "pi_6" } },
    });
    const lost = JSON.stringify({
      id: "evt_7",
      type: "charge.dispute.closed",
      data: { object: { id: "dp_2", status: "lost", payment_intent: "pi_7" } },
    });
    expect(provider.parseWebhookEvent(Buffer.from(won), sign(won)).type).toBe(
      ProviderEventType.DISPUTE_CLOSED_WON,
    );
    expect(provider.parseWebhookEvent(Buffer.from(lost), sign(lost)).type).toBe(
      ProviderEventType.DISPUTE_CLOSED_LOST,
    );
  });
});

describe("stubPaymentProvider", () => {
  it("createPayment es determinista: la misma idempotencyKey produce el mismo providerId", async () => {
    const provider = createStubPaymentProvider();
    const a = await provider.createPayment({
      amount: 1000,
      currency: Currency.MXN,
      idempotencyKey: "same-key",
      metadata: { orderId: "o1", publicId: "p1" },
    });
    const b = await provider.createPayment({
      amount: 1000,
      currency: Currency.MXN,
      idempotencyKey: "same-key",
      metadata: { orderId: "o1", publicId: "p1" },
    });
    expect(a.providerId).toBe(b.providerId);
    expect(a.clientSecret).toBeDefined();
  });

  it("parseWebhookEvent verifica un HMAC propio y rechaza firmas inválidas", () => {
    const provider = createStubPaymentProvider();
    const payload = JSON.stringify({
      id: "evt_stub_1",
      type: "succeeded",
      orderId: "o1",
      paymentId: "pi_stub_1",
    });
    const validSig = createHmac("sha256", "stub_dev_secret").update(payload).digest("hex");

    const event = provider.parseWebhookEvent(Buffer.from(payload), validSig);
    expect(event.type).toBe(ProviderEventType.PAYMENT_SUCCEEDED);

    expect(() => provider.parseWebhookEvent(Buffer.from(payload), "0".repeat(64))).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});

describe("factory getPaymentProvider", () => {
  it("devuelve un provider funcional cuando env.stripe es null (stub, sin red)", async () => {
    // In the test environment STRIPE_* is deleted (tests/setup.ts), so env.stripe is null.
    const provider = getPaymentProvider();
    const result = await provider.createPayment({
      amount: 100,
      currency: Currency.MXN,
      idempotencyKey: "factory-key",
      metadata: { orderId: "o1", publicId: "p1" },
    });
    expect(result.providerId).toMatch(/^pi_stub_/);
  });
});
