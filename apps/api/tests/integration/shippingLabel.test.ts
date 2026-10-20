import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OrderStatus, NotificationType, DisputeStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { Settings, SINGLETON_KEY } from "../../src/models/Settings.js";
import { ShippingProviderError } from "../../src/adapters/shipping/index.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import { purchaseLabelForOrder, settleLabelWork } from "../../src/services/shippingLabelService.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";
import { installFakeShippingProvider, restoreShippingProvider } from "../helpers/fakeShippingProvider.js";

const app = buildApp();
let variantId: string;
beforeEach(async () => {
  const cookie = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "LABEL", 200);
});
afterEach(() => restoreShippingProvider());

const payOrder = async () => {
  const order = await createPendingOrder(variantId);
  await applyPaymentSucceeded(order._id);
  await settleLabelWork();
  return order._id;
};
const labelOf = async (id: unknown) => (await Order.findById(id).lean())?.label;

describe("compra de guía al pagar", () => {
  it("al pagar queda una guía lista (stub) con paquetería y número de rastreo", async () => {
    const id = await payOrder();
    const label = await labelOf(id);
    expect(label?.status).toBe("ready");
    expect(label?.trackingNumber).toMatch(/^STUB/);
    expect(label?.carrier).toBe("estafeta");
    expect(label?.labelUrl).toMatch(/^https:/);
    expect(label?.attempts).toBe(1);
    expect(label?.lastError).toBeUndefined();
  });

  it("re-ejecutar los efectos del pago no compra una segunda guía", async () => {
    const fake = installFakeShippingProvider();
    const id = await payOrder();
    await applyPaymentSucceeded(id);
    await settleLabelWork();
    expect(fake.createLabel).toHaveBeenCalledTimes(1);
  });

  it("dos compras simultáneas de la misma orden: solo una llega al proveedor", async () => {
    const fake = installFakeShippingProvider();
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID,
      label: { status: "pending", attempts: 0, cancelAttempts: 0, nextAttemptAt: new Date() } } });
    const results = await Promise.all([purchaseLabelForOrder(order._id), purchaseLabelForOrder(order._id)]);
    expect(results.filter((r) => r === "purchased")).toHaveLength(1);
    expect(fake.createLabel).toHaveBeenCalledTimes(1);
  });

  it("un fallo reintentable deja la guía en failed con backoff y vuelve a intentarse", async () => {
    const fake = installFakeShippingProvider();
    fake.createLabel.mockRejectedValueOnce(new ShippingProviderError("unavailable", "Envía pidió esperar"));
    const id = await payOrder();
    const failed = await labelOf(id);
    expect(failed?.status).toBe("failed");
    expect(failed?.attempts).toBe(1);
    expect(failed?.lastError).toContain("esperar");
    expect(failed?.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);

    await Order.updateOne({ _id: id }, { $set: { "label.nextAttemptAt": new Date(Date.now() - 1000) } });
    expect(await purchaseLabelForOrder(id)).toBe("purchased");
    expect((await labelOf(id))?.status).toBe("ready");
    expect((await labelOf(id))?.attempts).toBe(2);
  });

  it("agotados los 5 intentos pasa a needs_review y avisa al equipo una sola vez", async () => {
    const fake = installFakeShippingProvider();
    fake.createLabel.mockRejectedValue(new ShippingProviderError("unavailable", "caído"));
    const id = await payOrder();
    for (let i = 0; i < 4; i += 1) {
      await Order.updateOne({ _id: id }, { $set: { "label.nextAttemptAt": new Date(Date.now() - 1000) } });
      await purchaseLabelForOrder(id);
    }
    expect((await labelOf(id))?.status).toBe("needs_review");
    expect((await labelOf(id))?.attempts).toBe(5);
    expect(await Notification.countDocuments({ order: id, type: NotificationType.TEAM_SHIPPING_LABEL_FAILED })).toBe(1);
  });

  it("un resultado incierto (timeout) va directo a needs_review y NO se recompra", async () => {
    const fake = installFakeShippingProvider();
    fake.createLabel.mockRejectedValueOnce(new ShippingProviderError("unknown_outcome", "sin confirmación"));
    const id = await payOrder();
    expect((await labelOf(id))?.status).toBe("needs_review");
    await Order.updateOne({ _id: id }, { $set: { "label.nextAttemptAt": new Date(Date.now() - 1000) } });
    expect(await purchaseLabelForOrder(id)).toBe("skipped");
    expect(fake.createLabel).toHaveBeenCalledTimes(1);
  });

  it("un rechazo del proveedor (saldo, dirección) va a needs_review sin reintentos", async () => {
    const fake = installFakeShippingProvider();
    fake.createLabel.mockRejectedValueOnce(new ShippingProviderError("rejected", "Saldo insuficiente"));
    const id = await payOrder();
    const label = await labelOf(id);
    expect(label?.status).toBe("needs_review");
    expect(label?.lastError).toContain("Saldo");
  });

  it("sin origen configurado la guía va a needs_review con el motivo", async () => {
    const order = await createPendingOrder(variantId);
    await Settings.updateOne({ key: SINGLETON_KEY }, { $unset: { "shipping.origin": "" } });
    await applyPaymentSucceeded(order._id);
    await settleLabelWork();
    const label = await labelOf(order._id);
    expect(label?.status).toBe("needs_review");
    expect(label?.lastError).toBe("origin_not_configured");
  });

  it("no compra guía si hay una disputa abierta", async () => {
    const fake = installFakeShippingProvider();
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { disputeStatus: DisputeStatus.OPEN } });
    await applyPaymentSucceeded(order._id);
    await settleLabelWork();
    expect(fake.createLabel).not.toHaveBeenCalled();
    expect((await labelOf(order._id))?.status).toBe("pending");
  });

  it("un éxito tardío (tras el lease) igualmente se guarda: el dinero ya se gastó", async () => {
    const fake = installFakeShippingProvider();
    let release!: () => void;
    fake.createLabel.mockImplementationOnce(
      (input, opts) => new Promise((resolve) => { release = () => resolve({
        providerShipmentId: "late-1", trackingNumber: "LATE123", carrier: input.carrier,
        labelUrl: "https://stub.invalid/l.pdf", trackUrl: "https://stub.invalid/t", costMxn: 12_000 }); void opts; }),
    );
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID,
      label: { status: "pending", attempts: 0, cancelAttempts: 0, nextAttemptAt: new Date() } } });
    const inFlight = purchaseLabelForOrder(order._id);
    await new Promise((r) => setTimeout(r, 20));
    await Order.updateOne({ _id: order._id }, { $set: { "label.status": "needs_review" } }); // lease job gave up
    release();
    await inFlight;
    const label = await labelOf(order._id);
    expect(label?.status).toBe("ready");
    expect(label?.trackingNumber).toBe("LATE123");
  });
});
