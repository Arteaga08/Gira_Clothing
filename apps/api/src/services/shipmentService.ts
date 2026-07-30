import {
  AuditAction,
  AuditModule,
  NotificationChannelKind,
  NotificationType,
  OrderStatus,
  ShipmentStatus,
} from "@gira/shared";
import type { ApiMeta, AdminShipmentListItem } from "@gira/shared";
import { Shipment, type ShipmentDocument, type ShipmentAttrs } from "../models/Shipment.js";
import { Order, type OrderDocument } from "../models/Order.js";
import { AppError } from "../utils/AppError.js";
import { assertAdminTransition } from "../utils/orderTransitions.js";
import { assertShipmentTransition } from "../utils/shipmentTransitions.js";
import { enqueueNotification } from "./notificationService.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";
import {
  parseListQuery,
  buildMeta,
  type ListQueryConfig,
  type RawListQuery,
} from "../utils/parseListQuery.js";

/**
 * Manual shipping. Capturing the guide is ONE operation, not two: it creates the
 * parcel, moves the order to `shipped` through assertAdminTransition (the same
 * gate every other status change goes through), and queues the tracking email.
 * Splitting it would allow "order shipped with no guide captured", which is the
 * exact state the customer calls about.
 *
 * The order transition is validated FIRST: a 409 must leave no shipment behind.
 */

interface CreateShipmentInput {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
}

interface PublicTracking {
  status: ShipmentStatus;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  events: { status: ShipmentStatus; at: Date; note?: string }[];
}

interface AdminShipment extends PublicTracking {
  orderPublicId: string;
  createdAt: Date;
  updatedAt: Date;
}

const toPublicTracking = (doc: ShipmentDocument): PublicTracking => ({
  status: doc.status,
  carrier: doc.carrier,
  trackingNumber: doc.trackingNumber,
  ...(doc.trackingUrl ? { trackingUrl: doc.trackingUrl } : {}),
  events: doc.events.map((event) => ({
    status: event.status,
    at: event.at,
    ...(event.note ? { note: event.note } : {}),
  })),
});

const toAdminShipment = (doc: ShipmentDocument): AdminShipment => ({
  ...toPublicTracking(doc),
  orderPublicId: doc.orderPublicId,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code?: number }).code === 11000;

const queueShippedEmail = async (
  order: OrderDocument,
  shipment: ShipmentDocument,
): Promise<void> => {
  await enqueueNotification({
    channel: NotificationChannelKind.EMAIL,
    type: NotificationType.ORDER_SHIPPED,
    to: order.customer.email,
    order: order._id,
    payload: {
      publicId: order.publicId,
      customerName: order.customer.name,
      currency: order.currency,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      total: order.total,
      lines: order.lines.map((line) => ({
        productName: line.productName,
        printName: line.printName,
        qty: line.qty,
        lineTotal: line.lineTotal,
      })),
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
    },
  });
};

const createShipment = async (
  orderId: string,
  input: CreateShipmentInput,
  ctx: RequestContext,
): Promise<AdminShipment> => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError("La orden no existe.", 404);

  // Validated BEFORE any write: an invalid move must leave nothing behind.
  assertAdminTransition(order.status, OrderStatus.SHIPPED);

  let shipment: ShipmentDocument;
  try {
    shipment = await Shipment.create({
      order: order._id,
      orderPublicId: order.publicId,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      ...(input.trackingUrl ? { trackingUrl: input.trackingUrl } : {}),
      status: ShipmentStatus.IN_TRANSIT,
      events: [{ status: ShipmentStatus.IN_TRANSIT, at: new Date() }],
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError("Esta orden ya tiene un envío registrado.", 409);
    }
    throw err;
  }

  order.status = OrderStatus.SHIPPED;
  order.statusHistory.push({ status: OrderStatus.SHIPPED, at: new Date(), reason: "shipment_created" });
  await order.save();

  await queueShippedEmail(order, shipment);

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SHIPMENT_CREATED,
    module: AuditModule.SHIPPING,
    targetId: order.publicId,
    // Carrier + guide are operational data, not PII.
    after: { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber },
    ip: ctx.ip,
  });

  return toAdminShipment(shipment);
};

/** Statuses that mean the parcel needs a human right now. */
const INCIDENT_STATUSES = new Set<ShipmentStatus>([ShipmentStatus.RETURNED, ShipmentStatus.LOST]);

const addShipmentEvent = async (
  orderId: string,
  input: { status: ShipmentStatus; note?: string },
  ctx: RequestContext,
): Promise<AdminShipment> => {
  const shipment = await Shipment.findOne({ order: orderId });
  if (!shipment) throw new AppError("Esta orden no tiene un envío registrado.", 404);

  assertShipmentTransition(shipment.status, input.status);
  const before = shipment.status;
  shipment.status = input.status;
  shipment.events.push({
    status: input.status,
    at: new Date(),
    ...(input.note ? { note: input.note } : {}),
  });
  await shipment.save();

  // Delivery is the ONE parcel state the order mirrors. Everything else
  // (out for delivery, returned, lost) is parcel-only: the order stays shipped,
  // and a refund — if it comes — flows through the payment provider as always.
  if (input.status === ShipmentStatus.DELIVERED) {
    const order = await Order.findById(orderId);
    if (order && order.status === OrderStatus.SHIPPED) {
      assertAdminTransition(order.status, OrderStatus.DELIVERED);
      order.status = OrderStatus.DELIVERED;
      order.statusHistory.push({
        status: OrderStatus.DELIVERED,
        at: new Date(),
        reason: "shipment_delivered",
      });
      await order.save();
    }
  }

  if (INCIDENT_STATUSES.has(input.status)) {
    await enqueueNotification({
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_SHIPMENT_INCIDENT,
      to: "team",
      payload: {
        publicId: shipment.orderPublicId,
        status: input.status,
        carrier: shipment.carrier,
      },
    });
  }

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SHIPMENT_STATUS_CHANGED,
    module: AuditModule.SHIPPING,
    targetId: shipment.orderPublicId,
    before: { status: before },
    after: { status: input.status },
    ip: ctx.ip,
  });

  return toAdminShipment(shipment);
};

const getAdminShipment = async (orderId: string): Promise<AdminShipment> => {
  const shipment = await Shipment.findOne({ order: orderId });
  if (!shipment) throw new AppError("Esta orden no tiene un envío registrado.", 404);
  return toAdminShipment(shipment);
};

/**
 * Public tracking by the order's capability id. Returns the SAME 404 whether
 * the order does not exist or simply has no shipment yet — distinguishing them
 * would turn this endpoint into an order-existence oracle.
 */
const getPublicTracking = async (orderPublicId: string): Promise<PublicTracking> => {
  const shipment = await Shipment.findOne({ orderPublicId });
  if (!shipment) throw new AppError("Todavía no hay información de envío para este pedido.", 404);
  return toPublicTracking(shipment);
};

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "updatedAt", "status"],
  searchable: ["trackingNumber", "orderPublicId", "carrier"],
  defaultSort: "-updatedAt",
};

interface ShipmentListQuery extends RawListQuery {
  status?: ShipmentStatus;
  carrier?: string;
}

// Structural read-model over a .lean() doc — events[] is unbounded, so the
// list projects it away and keeps only the timestamp of the latest one.
// Kept separate from AdminShipment/toAdminShipment on purpose: that DTO has
// no id/order (the order-nested endpoint never needed them), and a list row
// does.
interface ShipmentListLean extends Omit<ShipmentAttrs, "events"> {
  _id: unknown;
  events: { at: Date }[];
}

const toShipmentListItem = (doc: ShipmentListLean): AdminShipmentListItem => ({
  id: String(doc._id),
  order: String(doc.order),
  orderPublicId: doc.orderPublicId,
  carrier: doc.carrier,
  trackingNumber: doc.trackingNumber,
  ...(doc.trackingUrl ? { trackingUrl: doc.trackingUrl } : {}),
  status: doc.status,
  lastEventAt: doc.events.at(-1)?.at ?? doc.updatedAt,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const listAdminShipments = async (
  query: ShipmentListQuery,
): Promise<{ items: AdminShipmentListItem[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.status) filters.status = query.status;
  if (query.carrier) filters.carrier = query.carrier;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    Shipment.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Shipment.countDocuments(filter),
  ]);

  return {
    items: (docs as unknown as ShipmentListLean[]).map(toShipmentListItem),
    meta: buildMeta(total, { page, limit }),
  };
};

export type { CreateShipmentInput, PublicTracking, AdminShipment };
export { createShipment, addShipmentEvent, getAdminShipment, getPublicTracking, listAdminShipments };
