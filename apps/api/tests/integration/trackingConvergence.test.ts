import { beforeEach, afterEach, describe, it, expect } from "vitest";
import {
  DisputeStatus,
  NotificationType,
  OrderStatus,
  ShipmentTrackingStatus as S,
  ShippingLabelStatus,
} from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order, type OrderDocument } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { ShipmentTrackingEvent } from "../../src/models/ShipmentTrackingEvent.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
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
  variantId = await seedCatalogVariant(app, cookie, "TRACK", 200);
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

const ev = (
  order: OrderDocument,
  status: S,
  minute = 0,
  id = `e-${order.label!.trackingNumber!}-${status}-${String(minute)}`,
) => ({
  trackingNumber: order.label!.trackingNumber!,
  status,
  rawStatus: status,
  occurredAt: new Date(Date.UTC(2026, 9, 19, 10, minute)),
  providerEventId: id,
});

const notifications = (order: OrderDocument, type: NotificationType) =>
  Notification.find({ order: order._id, type }).lean();

import { vi } from "vitest";
import * as notificationService from "../../src/services/notificationService.js";
import {
  applyTrackingEvents,
  syntheticEventId,
} from "../../src/services/shipmentTrackingService.js";

const PROVIDER = "stub";

describe("applyTrackingEvents · convergencia", () => {
  it("processing + picked_up -> shipped, shippedAt y un solo correo", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents(PROVIDER, [ev(order, S.PICKED_UP)]);
    await applyTrackingEvents(PROVIDER, [ev(order, S.IN_TRANSIT, 5)]);
    const fresh = await Order.findById(order._id).lean();
    expect(fresh?.status).toBe(OrderStatus.SHIPPED);
    expect(fresh?.shippedAt).toBeInstanceOf(Date);
    expect(fresh?.tracking?.status).toBe(S.IN_TRANSIT);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
    const history = fresh?.statusHistory.map((h) => h.status);
    expect(history?.at(-1)).toBe(OrderStatus.SHIPPED);
    expect(fresh?.statusHistory.at(-1)?.actorType).toBe("system");
  });

  it("paid + in_transit -> encadena a shipped sin correo 'en preparación'", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PAID);
    await applyTrackingEvents(PROVIDER, [ev(order, S.IN_TRANSIT)]);
    const fresh = await Order.findById(order._id).lean();
    expect(fresh?.status).toBe(OrderStatus.SHIPPED);
    expect(fresh?.statusHistory.map((h) => h.status)).toEqual(
      expect.arrayContaining([OrderStatus.PROCESSING, OrderStatus.SHIPPED]),
    );
    expect(await notifications(order, NotificationType.ORDER_PREPARING)).toHaveLength(0);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
  });

  it("delivered desde processing -> delivered con SOLO el correo de entregado", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents(PROVIDER, [ev(order, S.DELIVERED)]);
    const fresh = await Order.findById(order._id).lean();
    expect(fresh?.status).toBe(OrderStatus.DELIVERED);
    expect(fresh?.deliveredAt).toBeInstanceOf(Date);
    expect(fresh?.shippedAt).toBeInstanceOf(Date);
    expect(await notifications(order, NotificationType.ORDER_DELIVERED)).toHaveLength(1);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(0);
  });

  it("delivered desde shipped -> delivered, un correo de entregado y no repite shipped", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents(PROVIDER, [ev(order, S.PICKED_UP)]);
    await applyTrackingEvents(PROVIDER, [ev(order, S.DELIVERED, 30)]);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.DELIVERED);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
    expect(await notifications(order, NotificationType.ORDER_DELIVERED)).toHaveLength(1);
  });

  it("el mismo evento dos veces (webhook + polling) deja un evento y una transición", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const same = ev(order, S.PICKED_UP, 0, "dup-1");
    await Promise.all([
      applyTrackingEvents(PROVIDER, [same]),
      applyTrackingEvents(PROVIDER, [same]),
    ]);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
    expect(
      (await Order.findById(order._id).lean())?.statusHistory.filter(
        (h) => h.status === OrderStatus.SHIPPED,
      ),
    ).toHaveLength(1);
  });

  it("un evento viejo no retrocede order.tracking pero sí queda guardado", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents(PROVIDER, [ev(order, S.OUT_FOR_DELIVERY, 30)]);
    await applyTrackingEvents(PROVIDER, [ev(order, S.IN_TRANSIT, 10)]);
    expect((await Order.findById(order._id).lean())?.tracking?.status).toBe(S.OUT_FOR_DELIVERY);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(2);
  });

  it("disputa abierta o perdida: no mueve el estado y audita el bloqueo", async () => {
    for (const dispute of [DisputeStatus.OPEN, DisputeStatus.LOST]) {
      const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
      await Order.updateOne(
        { _id: order._id },
        { $set: { disputeStatus: dispute, disputedAt: new Date() } },
      );
      await applyTrackingEvents(PROVIDER, [ev(order, S.PICKED_UP)]);
      const fresh = await Order.findById(order._id).lean();
      expect(fresh?.status).toBe(OrderStatus.PROCESSING);
      expect(fresh?.tracking?.status).toBe(S.PICKED_UP);
      expect(
        await AuditLog.countDocuments({
          action: "tracking_transition_blocked",
          targetId: String(order._id),
        }),
      ).toBe(1);
    }
  });

  it("orden refunded: guarda el evento y no la mueve", async () => {
    const order = await paidOrderWithLabel(OrderStatus.REFUNDED);
    await applyTrackingEvents(PROVIDER, [ev(order, S.DELIVERED)]);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.REFUNDED);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
  });

  it("incidencias: un solo aviso al equipo por orden, con order", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents(PROVIDER, [ev(order, S.EXCEPTION, 1), ev(order, S.LOST, 2)]);
    await applyTrackingEvents(PROVIDER, [ev(order, S.EXCEPTION, 3, "other")]);
    const sent = await notifications(order, NotificationType.TEAM_SHIPMENT_INCIDENT);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toMatchObject({ orderNumber: order.orderNumber });
  });

  it("ignora una guía que no pertenece a ninguna orden", async () => {
    await expect(
      applyTrackingEvents(PROVIDER, [
        {
          trackingNumber: "NOPE",
          status: S.DELIVERED,
          rawStatus: "x",
          occurredAt: new Date(),
          providerEventId: "z",
        },
      ]),
    ).resolves.toBeUndefined();
    expect(await ShipmentTrackingEvent.countDocuments()).toBe(0);
  });

  it("un duplicado ya guardado (crash antes de converger) todavía converge a shipped, con un correo", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const e = ev(order, S.PICKED_UP);
    await ShipmentTrackingEvent.create({
      order: order._id,
      provider: PROVIDER,
      ...e,
      providerEventId: syntheticEventId(e),
    });
    await applyTrackingEvents(PROVIDER, [e]);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.SHIPPED);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
  });

  it("un duplicado de entregado ya guardado converge a delivered, con un correo", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const e = ev(order, S.DELIVERED);
    await ShipmentTrackingEvent.create({
      order: order._id,
      provider: PROVIDER,
      ...e,
      providerEventId: syntheticEventId(e),
    });
    await applyTrackingEvents(PROVIDER, [e]);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.DELIVERED);
    expect(await notifications(order, NotificationType.ORDER_DELIVERED)).toHaveLength(1);
  });

  it("reaplicar un duplicado sobre una orden que ya avanzó no la mueve ni reenvía correo", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const e = ev(order, S.PICKED_UP);
    await applyTrackingEvents(PROVIDER, [e]);
    const before = await Order.findById(order._id).lean();
    await applyTrackingEvents(PROVIDER, [e]);
    await applyTrackingEvents(PROVIDER, [e]);
    const after = await Order.findById(order._id).lean();
    expect(after?.statusHistory).toHaveLength(before!.statusHistory.length);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
  });

  it("in_transit y delivered concurrentes no dejan la orden varada", async () => {
    for (let i = 0; i < 4; i += 1) {
      const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
      await Promise.all([
        applyTrackingEvents(PROVIDER, [ev(order, S.IN_TRANSIT, 1)]),
        applyTrackingEvents(PROVIDER, [ev(order, S.DELIVERED, 2)]),
      ]);
      expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.DELIVERED);
      expect(await notifications(order, NotificationType.ORDER_DELIVERED)).toHaveLength(1);
      expect(
        (await notifications(order, NotificationType.ORDER_SHIPPED)).length,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("self-heal: orden shipped sin correo + evento en movimiento -> aparece un solo ORDER_SHIPPED", async () => {
    const order = await paidOrderWithLabel(OrderStatus.SHIPPED);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(0);
    await applyTrackingEvents(PROVIDER, [ev(order, S.IN_TRANSIT, 1)]);
    await applyTrackingEvents(PROVIDER, [ev(order, S.OUT_FOR_DELIVERY, 2)]);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.SHIPPED);
  });

  it("self-heal: orden delivered sin correo + evento delivered -> aparece un solo ORDER_DELIVERED, nunca shipped", async () => {
    const order = await paidOrderWithLabel(OrderStatus.DELIVERED);
    await applyTrackingEvents(PROVIDER, [ev(order, S.IN_TRANSIT, 1)]);
    await applyTrackingEvents(PROVIDER, [ev(order, S.DELIVERED, 2)]);
    await applyTrackingEvents(PROVIDER, [ev(order, S.DELIVERED, 3, "again")]);
    expect(await notifications(order, NotificationType.ORDER_DELIVERED)).toHaveLength(1);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(0);
  });

  it("self-heal no encola nada en órdenes muertas ni con disputa", async () => {
    const dead = await paidOrderWithLabel(OrderStatus.REFUNDED);
    await applyTrackingEvents(PROVIDER, [ev(dead, S.IN_TRANSIT)]);
    const disputed = await paidOrderWithLabel(OrderStatus.SHIPPED);
    await Order.updateOne({ _id: disputed._id }, { $set: { disputeStatus: DisputeStatus.OPEN } });
    await applyTrackingEvents(PROVIDER, [ev(disputed, S.IN_TRANSIT)]);
    expect(
      await Notification.countDocuments({
        order: { $in: [dead._id, disputed._id] },
        type: { $in: [NotificationType.ORDER_SHIPPED, NotificationType.ORDER_DELIVERED] },
      }),
    ).toBe(0);
  });

  it("un encolado de correo que falla hace rechazar el evento; reaplicarlo deja shipped y un correo", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const real = notificationService.enqueueNotification;
    const spy = vi
      .spyOn(notificationService, "enqueueNotification")
      .mockImplementationOnce(() => Promise.reject(new Error("queue down")));
    const e = ev(order, S.PICKED_UP);
    await expect(applyTrackingEvents(PROVIDER, [e])).rejects.toThrow("queue down");
    spy.mockImplementation(real);
    await applyTrackingEvents(PROVIDER, [e]);
    spy.mockRestore();
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.SHIPPED);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
  });

  it("el mismo hecho con distinto providerEventId guarda una sola fila y un correo", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const { providerEventId: _a, ...fact } = ev(order, S.PICKED_UP);
    await applyTrackingEvents(PROVIDER, [fact]);
    await applyTrackingEvents(PROVIDER, [fact]);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
  });
});
