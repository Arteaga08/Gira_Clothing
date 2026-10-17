import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderStatus } from "@gira/shared";
import { seedOrder } from "../helpers/seedOrder.js";

const { mockSucceeded } = vi.hoisted(() => ({ mockSucceeded: vi.fn() }));

// Only the effect is controlled; dedupe/claim logic in webhookService is real.
vi.mock("../../src/services/orderPaymentService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/orderPaymentService.js")>();
  return { ...actual, applyPaymentSucceeded: mockSucceeded };
});

const { handleProviderEvent } = await import("../../src/services/webhookService.js");
const { AppError } = await import("../../src/utils/AppError.js");
const { WebhookEvent } = await import("../../src/models/WebhookEvent.js");
const { ProviderEventType } = await import("../../src/adapters/payment/index.js");

const makeEvent = async (id: string) => {
  const orderId = await seedOrder({ status: OrderStatus.PENDING_PAYMENT, total: 1000, createdAt: new Date() });
  return { id, type: ProviderEventType.PAYMENT_SUCCEEDED, orderId: String(orderId), raw: {} };
};

beforeEach(() => {
  mockSucceeded.mockReset();
  mockSucceeded.mockResolvedValue(undefined);
});

describe("webhook · evento fallido es reprocesable", () => {
  it("si el efecto lanza: el evento queda `failed` con el error y el error se propaga (5xx)", async () => {
    mockSucceeded.mockRejectedValueOnce(new Error("boom"));
    const event = await makeEvent("evt_f1");

    await expect(handleProviderEvent(event)).rejects.toThrow("boom");

    const row = await WebhookEvent.findOne({ eventId: "evt_f1" }).lean();
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("boom");
  });

  it("la reentrega de un evento `failed` lo reprocesa y queda `processed`", async () => {
    mockSucceeded.mockRejectedValueOnce(new Error("boom"));
    const event = await makeEvent("evt_f2");
    await expect(handleProviderEvent(event)).rejects.toThrow();

    const outcome = await handleProviderEvent(event);

    expect(outcome).toBe("processed");
    expect(mockSucceeded).toHaveBeenCalledTimes(2);
    const row = await WebhookEvent.findOne({ eventId: "evt_f2" }).lean();
    expect(row?.status).toBe("processed");
    expect(row?.attempts).toBe(2);
  });

  it("un error 4xx determinista (transición ilegal) es terminal: 200, sin reintento infinito", async () => {
    mockSucceeded.mockRejectedValueOnce(new AppError("transición ilegal", 409));
    const event = await makeEvent("evt_f6");

    expect(await handleProviderEvent(event)).toBe("processed");

    const row = await WebhookEvent.findOne({ eventId: "evt_f6" }).lean();
    expect(row?.status).toBe("ignored");
    expect(row?.error).toContain("transición ilegal");
    expect(await handleProviderEvent(event)).toBe("duplicate");
    expect(mockSucceeded).toHaveBeenCalledTimes(1);
  });

  it("la reentrega de un evento `processed` sigue siendo duplicate y no corre el efecto", async () => {
    const event = await makeEvent("evt_f3");
    await handleProviderEvent(event);
    const outcome = await handleProviderEvent(event);
    expect(outcome).toBe("duplicate");
    expect(mockSucceeded).toHaveBeenCalledTimes(1);
  });

  it("dos reentregas concurrentes de un `failed`: exactamente una reprocesa", async () => {
    mockSucceeded.mockRejectedValueOnce(new Error("boom"));
    const event = await makeEvent("evt_f4");
    await expect(handleProviderEvent(event)).rejects.toThrow();

    const results = await Promise.allSettled([handleProviderEvent(event), handleProviderEvent(event)]);

    // The loser sees a fresh `processing` row: non-2xx so the provider retries later.
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ statusCode: 409 });
    expect(mockSucceeded).toHaveBeenCalledTimes(2);
  });

  it("un `processing` viejo (proceso caído a media ejecución) se reclama; uno reciente no", async () => {
    const event = await makeEvent("evt_f5");
    // Simulate a crash after the claim: the row stays `processing`.
    await WebhookEvent.create({
      provider: "stripe",
      eventId: "evt_f5",
      type: event.type,
      status: "processing",
      purgeAt: new Date(Date.now() + 1e9),
    });

    // Fresh `processing`: not stale, not duplicate -> retry later (409), no effect.
    await expect(handleProviderEvent(event)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockSucceeded).not.toHaveBeenCalled();

    await WebhookEvent.collection.updateOne(
      { eventId: "evt_f5" },
      { $set: { updatedAt: new Date(Date.now() - 10 * 60 * 1000) } },
    );
    expect(await handleProviderEvent(event)).toBe("processed");
    expect(mockSucceeded).toHaveBeenCalledTimes(1);
  });
});
