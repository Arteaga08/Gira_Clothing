import { describe, it, expect } from "vitest";
import { OrderStatus } from "@gira/shared";
import { seedOrder } from "../helpers/seedOrder.js";
import { Order } from "../../src/models/Order.js";

describe("Order · índice único parcial en payment.intentId", () => {
  it("dos órdenes no pueden compartir el mismo intentId", async () => {
    await Order.init();
    const a = await seedOrder({ status: OrderStatus.PENDING_PAYMENT, total: 1000, createdAt: new Date() });
    const b = await seedOrder({ status: OrderStatus.PENDING_PAYMENT, total: 1000, createdAt: new Date() });
    await Order.updateOne({ _id: a }, { $set: { "payment.intentId": "pi_dup" } });

    await expect(
      Order.updateOne({ _id: b }, { $set: { "payment.intentId": "pi_dup" } }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("varias órdenes sin intentId conviven (el índice es parcial, no trata null como duplicado)", async () => {
    await Order.init();
    await seedOrder({ status: OrderStatus.PENDING_PAYMENT, total: 1000, createdAt: new Date() });
    await expect(
      seedOrder({ status: OrderStatus.PENDING_PAYMENT, total: 1000, createdAt: new Date() }),
    ).resolves.toBeDefined();
  });
});
