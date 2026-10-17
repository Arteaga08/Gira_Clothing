import { describe, it, expect } from "vitest";
import { OrderStatus, MAX_STATUS_HISTORY, PaymentStatus } from "@gira/shared";
import { seedOrder } from "../helpers/seedOrder.js";
import { Order } from "../../src/models/Order.js";
import { applyOrderTransition } from "../../src/services/orderTransitionService.js";

const system = { type: "system" } as const;

describe("applyOrderTransition", () => {
  it("mueve el estado y appendea historial con actor y motivo", async () => {
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });
    const updated = await applyOrderTransition({
      orderId: id,
      from: OrderStatus.PAID,
      to: OrderStatus.PROCESSING,
      actor: { type: "user", id: "64b000000000000000000001" },
      reason: "test",
    });
    expect(updated?.status).toBe(OrderStatus.PROCESSING);
    const last = updated!.statusHistory.at(-1)!;
    expect(last).toMatchObject({ status: OrderStatus.PROCESSING, actorType: "user", reason: "test" });
    expect(String(last.actorId)).toBe("64b000000000000000000001");
  });

  it("aplica `set` en la misma escritura atómica", async () => {
    const id = await seedOrder({ status: OrderStatus.PENDING_PAYMENT, total: 1000, createdAt: new Date() });
    const paidAt = new Date();
    const updated = await applyOrderTransition({
      orderId: id,
      from: OrderStatus.PENDING_PAYMENT,
      to: OrderStatus.PAID,
      actor: system,
      set: { paidAt, "payment.status": PaymentStatus.SUCCEEDED },
    });
    expect(updated?.paidAt).toEqual(paidAt);
    expect(updated?.payment.status).toBe(PaymentStatus.SUCCEEDED);
  });

  it("lanza 409 ante una transición ilegal y no escribe nada", async () => {
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });
    await expect(
      applyOrderTransition({ orderId: id, from: OrderStatus.PAID, to: OrderStatus.EXPIRED, actor: system }),
    ).rejects.toMatchObject({ statusCode: 409 });
    const doc = await Order.findById(id).lean();
    expect(doc?.status).toBe(OrderStatus.PAID);
    expect(doc?.statusHistory).toHaveLength(1);
  });

  it("devuelve null si el estado actual ya no es `from` (perdió la carrera)", async () => {
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });
    const result = await applyOrderTransition({
      orderId: id,
      from: OrderStatus.PENDING_PAYMENT,
      to: OrderStatus.EXPIRED,
      actor: system,
    });
    expect(result).toBeNull();
    expect((await Order.findById(id).lean())?.status).toBe(OrderStatus.PAID);
  });

  it("paid vs expired concurrentes: exactamente una gana y el historial tiene una entrada nueva", async () => {
    const id = await seedOrder({ status: OrderStatus.PENDING_PAYMENT, total: 1000, createdAt: new Date() });
    const [a, b] = await Promise.all([
      applyOrderTransition({ orderId: id, from: OrderStatus.PENDING_PAYMENT, to: OrderStatus.PAID, actor: system }),
      applyOrderTransition({ orderId: id, from: OrderStatus.PENDING_PAYMENT, to: OrderStatus.EXPIRED, actor: system }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const doc = await Order.findById(id).lean();
    expect(doc?.statusHistory).toHaveLength(2);
    expect([OrderStatus.PAID, OrderStatus.EXPIRED]).toContain(doc?.status);
  });

  it("respeta el tope MAX_STATUS_HISTORY conservando lo más reciente", async () => {
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });
    const filler = Array.from({ length: MAX_STATUS_HISTORY + 10 }, (_, i) => ({
      status: OrderStatus.PAID,
      at: new Date(i),
      actorType: "system",
    }));
    await Order.collection.updateOne({ _id: id }, { $set: { statusHistory: filler } });
    const updated = await applyOrderTransition({
      orderId: id,
      from: OrderStatus.PAID,
      to: OrderStatus.PROCESSING,
      actor: system,
    });
    expect(updated?.statusHistory).toHaveLength(MAX_STATUS_HISTORY);
    expect(updated?.statusHistory.at(-1)?.status).toBe(OrderStatus.PROCESSING);
  });

  it("fija fulfillmentStartedAt al entrar a processing, una sola vez, y no antes", async () => {
    const id = await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: new Date() });
    expect((await Order.findById(id).lean())?.fulfillmentStartedAt).toBeUndefined();

    const processing = await applyOrderTransition({
      orderId: id,
      from: OrderStatus.PAID,
      to: OrderStatus.PROCESSING,
      actor: system,
    });
    const firstStamp = processing?.fulfillmentStartedAt;
    expect(firstStamp).toBeInstanceOf(Date);

    const shipped = await applyOrderTransition({
      orderId: id,
      from: OrderStatus.PROCESSING,
      to: OrderStatus.SHIPPED,
      actor: system,
    });
    expect(shipped?.fulfillmentStartedAt).toEqual(firstStamp);
  });

  it("pagar o reembolsar no marca el arranque de surtido", async () => {
    const id = await seedOrder({ status: OrderStatus.PENDING_PAYMENT, total: 1000, createdAt: new Date() });
    const paid = await applyOrderTransition({
      orderId: id,
      from: OrderStatus.PENDING_PAYMENT,
      to: OrderStatus.PAID,
      actor: system,
    });
    expect(paid?.fulfillmentStartedAt).toBeUndefined();
  });
});
