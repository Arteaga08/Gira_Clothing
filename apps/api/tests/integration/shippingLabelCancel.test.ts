import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DisputeStatus, NotificationType, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { ShippingProviderError } from "../../src/adapters/shipping/index.js";
import { applyDisputeClosed, applyPaymentSucceeded, applyRefund } from "../../src/services/orderPaymentService.js";
import {
  processLabelCancellation, requestLabelCancellation, settleLabelWork,
} from "../../src/services/shippingLabelService.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";
import { installFakeShippingProvider, restoreShippingProvider } from "../helpers/fakeShippingProvider.js";

const app = buildApp();
let variantId: string;
beforeEach(async () => {
  const cookie = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "CANCEL", 300);
});
afterEach(() => restoreShippingProvider());

const paidWithLabel = async () => {
  const order = await createPendingOrder(variantId);
  await applyPaymentSucceeded(order._id);
  await settleLabelWork();
  return order;
};
const labelOf = async (id: unknown) => (await Order.findById(id).lean())?.label;

describe("cancelación de guía", () => {
  it("un reembolso total de un pedido pagado cancela la guía en el proveedor", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidWithLabel();
    const tracking = (await labelOf(order._id))?.trackingNumber;
    await applyRefund(order._id, order.total);
    await settleLabelWork();
    expect(fake.cancelLabel).toHaveBeenCalledWith({ carrier: "estafeta", trackingNumber: tracking }, expect.anything());
    const label = await labelOf(order._id);
    expect(label?.status).toBe("cancelled");
    expect(label?.cancelledAt).toBeInstanceOf(Date);
  });

  it("un reembolso PARCIAL no toca la guía", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidWithLabel();
    await applyRefund(order._id, 100);
    await settleLabelWork();
    expect(fake.cancelLabel).not.toHaveBeenCalled();
    expect((await labelOf(order._id))?.status).toBe("ready");
  });

  it("si el pedido ya salió (enviado) no se intenta cancelar", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidWithLabel();
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.SHIPPED } });
    await applyRefund(order._id, order.total);
    await settleLabelWork();
    expect(fake.cancelLabel).not.toHaveBeenCalled();
  });

  it("un contracargo perdido cancela la guía de un pedido que no ha salido", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidWithLabel();
    await applyDisputeClosed(order._id, DisputeStatus.LOST);
    await settleLabelWork();
    expect(fake.cancelLabel).toHaveBeenCalledTimes(1);
    expect((await labelOf(order._id))?.status).toBe("cancelled");
  });

  it("si el proveedor rechaza (ya escaneada) pasa a needs_review y avisa una vez", async () => {
    const fake = installFakeShippingProvider();
    fake.cancelLabel.mockRejectedValue(new ShippingProviderError("rejected", "ya recolectado"));
    const order = await paidWithLabel();
    await applyRefund(order._id, order.total);
    await settleLabelWork();
    expect((await labelOf(order._id))?.status).toBe("needs_review");
    expect(await Notification.countDocuments({ order: order._id, type: NotificationType.TEAM_SHIPPING_LABEL_CANCEL_FAILED })).toBe(1);
  });

  it("una caída del proveedor se reintenta con backoff y a los 3 intentos va a revisión", async () => {
    const fake = installFakeShippingProvider();
    fake.cancelLabel.mockRejectedValue(new ShippingProviderError("unavailable", "caído"));
    const order = await paidWithLabel();
    await applyRefund(order._id, order.total);
    await settleLabelWork();
    expect((await labelOf(order._id))?.status).toBe("cancel_pending");
    for (let i = 0; i < 2; i += 1) {
      await Order.updateOne({ _id: order._id }, { $set: { "label.nextAttemptAt": new Date(Date.now() - 1000) } });
      await processLabelCancellation(order._id);
    }
    expect((await labelOf(order._id))?.status).toBe("needs_review");
    expect(fake.cancelLabel).toHaveBeenCalledTimes(3);
  });

  it("una guía que aún no se compró (pending/failed) se cierra sin llamar al proveedor", async () => {
    const fake = installFakeShippingProvider();
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID,
      label: { status: "failed", attempts: 2, cancelAttempts: 0, nextAttemptAt: new Date() } } });
    expect(await requestLabelCancellation(order._id)).toBe("closed");
    expect(fake.cancelLabel).not.toHaveBeenCalled();
    expect((await labelOf(order._id))?.status).toBe("cancelled");
  });

  it("una compra en vuelo cuando se reembolsa cancela la guía en cuanto llega", async () => {
    const fake = installFakeShippingProvider();
    let release!: () => void;
    fake.createLabel.mockImplementationOnce(
      (input) => new Promise((resolve) => { release = () => resolve({
        providerShipmentId: "s1", trackingNumber: "RACE1", carrier: input.carrier,
        labelUrl: "https://stub.invalid/l", trackUrl: "https://stub.invalid/t", costMxn: 12_000 }); }),
    );
    const order = await createPendingOrder(variantId);
    await applyPaymentSucceeded(order._id); // dispara la compra, queda en vuelo
    await new Promise((r) => setTimeout(r, 20));
    await applyRefund(order._id, order.total);
    release();
    await settleLabelWork();
    expect(fake.cancelLabel).toHaveBeenCalledWith({ carrier: "estafeta", trackingNumber: "RACE1" }, expect.anything());
  });
});
