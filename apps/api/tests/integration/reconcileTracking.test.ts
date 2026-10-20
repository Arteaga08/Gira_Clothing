import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { OrderStatus, ShipmentTrackingStatus as S, ShippingLabelStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order, type OrderDocument } from "../../src/models/Order.js";
import { ShipmentTrackingEvent } from "../../src/models/ShipmentTrackingEvent.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import { vi } from "vitest";
import { applyTrackingEvents } from "../../src/services/shipmentTrackingService.js";
import { reconcileTracking } from "../../src/jobs/reconcileTracking.js";
import { ShippingProviderError } from "../../src/adapters/shipping/index.js";
import {
  installFakeShippingProvider,
  restoreShippingProvider,
} from "../helpers/fakeShippingProvider.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";

const app = buildApp();
let variantId: string;

beforeEach(async () => {
  installFakeShippingProvider();
  const cookie = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "RECON", 200);
});
afterEach(restoreShippingProvider);

/** An order that is PAID with a READY label, optionally advanced to `status`. */
const paidOrderWithLabel = async (
  status: OrderStatus = OrderStatus.PAID,
): Promise<OrderDocument> => {
  const order = await createPendingOrder(variantId);
  await applyPaymentSucceeded(order._id);
  await settleLabelWork();
  if (status !== OrderStatus.PAID) await Order.updateOne({ _id: order._id }, { $set: { status } });
  const fresh = await Order.findById(order._id);
  if (fresh?.label?.status !== ShippingLabelStatus.READY)
    throw new Error("label not ready in fixture");
  return fresh;
};

describe("reconcileTracking", () => {
  it("consulta las guías pendientes, aplica los eventos y marca lastSyncedAt", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    fake.getTracking.mockResolvedValueOnce([
      {
        trackingNumber: order.label!.trackingNumber!,
        status: S.PICKED_UP,
        rawStatus: "Picked Up",
        occurredAt: new Date(),
      },
    ]);
    await reconcileTracking();
    expect(fake.getTracking).toHaveBeenCalledTimes(1);
    expect(fake.getTracking).toHaveBeenCalledWith([order.label!.trackingNumber], expect.anything());
    const fresh = await Order.findById(order._id).lean();
    expect(fresh?.status).toBe(OrderStatus.SHIPPED);
    expect(fresh?.tracking?.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("no consulta lo sincronizado hace menos de 30 min, ni guías viejas (>30 días), ni órdenes entregadas", async () => {
    const fake = installFakeShippingProvider();
    const recent = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await Order.updateOne(
      { _id: recent._id },
      { $set: { "tracking.status": S.LABEL_CREATED, "tracking.lastSyncedAt": new Date() } },
    );
    const old = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await Order.updateOne(
      { _id: old._id },
      { $set: { "label.readyAt": new Date(Date.now() - 31 * 86_400_000) } },
    );
    const done = await paidOrderWithLabel(OrderStatus.DELIVERED);
    expect((await Order.findById(done._id).lean())?.status).toBe(OrderStatus.DELIVERED);
    await reconcileTracking();
    expect(fake.getTracking).not.toHaveBeenCalled();
  });

  it("solo pregunta por las guías vencidas, no por las excluidas", async () => {
    const fake = installFakeShippingProvider();
    const due = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const stale = await paidOrderWithLabel(OrderStatus.SHIPPED);
    await Order.updateOne(
      { _id: stale._id },
      {
        $set: {
          "tracking.status": S.IN_TRANSIT,
          "tracking.lastSyncedAt": new Date(Date.now() - 31 * 60_000),
        },
      },
    );
    const recent = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await Order.updateOne(
      { _id: recent._id },
      { $set: { "tracking.status": S.LABEL_CREATED, "tracking.lastSyncedAt": new Date() } },
    );
    const old = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await Order.updateOne(
      { _id: old._id },
      { $set: { "label.readyAt": new Date(Date.now() - 31 * 86_400_000) } },
    );
    const done = await paidOrderWithLabel(OrderStatus.DELIVERED);
    fake.getTracking.mockResolvedValueOnce([]);
    await reconcileTracking();
    expect(fake.getTracking).toHaveBeenCalledTimes(1);
    const asked = fake.getTracking.mock.calls[0]![0] as string[];
    expect([...asked].sort()).toEqual(
      [due.label!.trackingNumber!, stale.label!.trackingNumber!].sort(),
    );
    for (const excluded of [recent, old, done])
      expect(asked).not.toContain(excluded.label!.trackingNumber);
  });

  it("un provider caído no rompe la corrida ni marca lastSyncedAt", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    fake.getTracking.mockRejectedValueOnce(new ShippingProviderError("unavailable", "caído"));
    await expect(reconcileTracking()).resolves.toBeUndefined();
    expect(fake.getTracking).toHaveBeenCalledTimes(1);
    expect((await Order.findById(order._id).lean())?.tracking?.lastSyncedAt).toBeUndefined();
  });

  it("dos corridas con el mismo estado no duplican eventos", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const same = {
      trackingNumber: order.label!.trackingNumber!,
      status: S.IN_TRANSIT,
      rawStatus: "Shipped",
      occurredAt: new Date("2026-10-19T10:00:00Z"),
    };
    fake.getTracking.mockResolvedValue([same]);
    await reconcileTracking();
    await Order.updateOne({ _id: order._id }, { $unset: { "tracking.lastSyncedAt": 1 } });
    await reconcileTracking();
    expect(fake.getTracking).toHaveBeenCalledTimes(2);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
  });

  it("una orden sin eventos queda en label_created con lastSyncedAt y aún puede avanzar", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    fake.getTracking.mockResolvedValueOnce([]);
    await reconcileTracking();
    const synced = await Order.findById(order._id).lean();
    expect(synced?.tracking?.status).toBe(S.LABEL_CREATED);
    expect(synced?.tracking?.lastSyncedAt).toBeInstanceOf(Date);
    expect(synced?.status).toBe(OrderStatus.PROCESSING);

    await applyTrackingEvents("stub", [
      {
        trackingNumber: order.label!.trackingNumber!,
        status: S.PICKED_UP,
        rawStatus: "Picked Up",
        occurredAt: new Date(),
        providerEventId: "later-1",
      },
    ]);
    const advanced = await Order.findById(order._id).lean();
    expect(advanced?.tracking?.status).toBe(S.PICKED_UP);
    expect(advanced?.status).toBe(OrderStatus.SHIPPED);
    expect(advanced?.tracking?.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("webhook y polling con el mismo hecho dejan una sola fila", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const occurredAt = new Date("2026-10-19T12:00:00.000Z");
    const fact = {
      trackingNumber: order.label!.trackingNumber!,
      status: S.PICKED_UP,
      rawStatus: "Picked Up",
      occurredAt,
    };
    // Webhook path: the service receives the fact (delivery id is not part of the key).
    await applyTrackingEvents("stub", [{ ...fact }]);
    fake.getTracking.mockResolvedValueOnce([{ ...fact }]);
    await Order.updateOne(
      { _id: order._id },
      { $set: { status: OrderStatus.PROCESSING }, $unset: { "tracking.lastSyncedAt": 1 } },
    );
    await reconcileTracking();
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
  });

  it("un evento venenoso no aborta el lote: la otra orden converge y solo esa se marca", async () => {
    const fake = installFakeShippingProvider();
    const bad = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const good = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const mk = (o: OrderDocument) => ({
      trackingNumber: o.label!.trackingNumber!,
      status: S.PICKED_UP,
      rawStatus: "Picked Up",
      occurredAt: new Date("2026-10-19T12:00:00.000Z"),
    });
    fake.getTracking.mockResolvedValue([mk(bad), mk(good)]);
    const original = ShipmentTrackingEvent.create.bind(ShipmentTrackingEvent);
    const spy = vi
      .spyOn(ShipmentTrackingEvent, "create")
      .mockImplementation(((doc: { trackingNumber?: string }) =>
        doc.trackingNumber === bad.label!.trackingNumber
          ? Promise.reject(new Error("poison"))
          : original(doc as never)) as never);
    await reconcileTracking();
    spy.mockRestore();
    const g = await Order.findById(good._id).lean();
    const b = await Order.findById(bad._id).lean();
    expect(g?.status).toBe(OrderStatus.SHIPPED);
    expect(g?.tracking?.lastSyncedAt).toBeInstanceOf(Date);
    expect(b?.status).toBe(OrderStatus.PROCESSING);
    expect(b?.tracking?.lastSyncedAt).toBeUndefined();
    await reconcileTracking();
    expect((await Order.findById(bad._id).lean())?.status).toBe(OrderStatus.SHIPPED);
  });
});
