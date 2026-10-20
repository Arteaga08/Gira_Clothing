import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import {
  Currency,
  NotificationType,
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
} from "@gira/shared";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const { mockGetPayment, mockCreate, mockCancel } = vi.hoisted(() => ({
  mockGetPayment: vi.fn(),
  mockCreate: vi.fn(),
  mockCancel: vi.fn(),
}));

// createOrder (used to seed fixtures) needs a working createPayment; the
// reconcilePayments tests need a controllable getPayment. Everything else on
// the real stub-backed provider stays untouched.
vi.mock("../../src/adapters/payment/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/adapters/payment/index.js")>();
  const real = actual.getPaymentProvider();
  const provider = {
    ...real,
    createPayment: mockCreate,
    getPayment: mockGetPayment,
    cancelPayment: mockCancel,
  };
  return { ...actual, getPaymentProvider: () => provider };
});

let intentCounter = 0;
mockCreate.mockImplementation(() =>
  Promise.resolve({
    providerId: `pi_job_${(intentCounter += 1)}`,
    status: PaymentStatus.REQUIRES_PAYMENT,
    amount: 1,
    currency: Currency.MXN,
    clientSecret: "secret_stub",
  }),
);

const { buildApp } = await import("../../src/app.js");
const { createOrderWithQuote: createOrder } = await import("../helpers/orders.js");
const { expireReservations } = await import("../../src/jobs/expireReservations.js");
const { reconcilePayments } = await import("../../src/jobs/reconcilePayments.js");
const { Order } = await import("../../src/models/Order.js");
const { Variant } = await import("../../src/models/Variant.js");
const { StockReservation } = await import("../../src/models/StockReservation.js");
const { AuditLog } = await import("../../src/models/AuditLog.js");
const { Notification } = await import("../../src/models/Notification.js");
const { applyPaymentSucceeded, applyPaymentFailed } = await import(
  "../../src/services/orderPaymentService.js"
);
const { applyOrderTransition } = await import("../../src/services/orderTransitionService.js");
const { releaseReservation } = await import("../../src/services/reservationService.js");

const app = buildApp();

const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const PRODUCTS_BASE = "/api/v1/admin/products";
const VARIANTS_BASE = "/api/v1/admin/variants";

const validImage = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};
const validShipping = {
  recipient: "Ana Pérez",
  line1: "Calle Falsa 123",
  district: "Juárez",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "01000",
  country: "MX",
};
const validCustomer = { email: "cliente@example.com", name: "Ana Pérez", phone: "5512345678" };
const uniqueKey = (): string => `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const seedVariant = async (adminCookie: string, suffix: string, onHand = 10): Promise<string> => {
  const familyRes = await request(app)
    .post(FAMILIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Familia ${suffix}` });
  const familyId = familyRes.body.data.family.id as string;

  const printRes = await request(app)
    .post(PRINTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Print ${suffix}`, sku: `SKU-${suffix}`, family: familyId, image: validImage });
  const printId = printRes.body.data.print.id as string;

  const categoryRes = await request(app)
    .post(CATEGORIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Categoría ${suffix}` });
  const categoryId = categoryRes.body.data.category.id as string;

  const productRes = await request(app)
    .post(PRODUCTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 10000, weightGrams: 400 });
  const productId = productRes.body.data.product.id as string;

  const variantRes = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ product: productId, print: printId, images: [validImage] });
  const variantId = variantRes.body.data.variant.id as string;

  await Variant.updateOne({ _id: variantId }, { $set: { onHand } });
  return variantId;
};

const seedOrder = async (adminCookie: string, suffix: string, qty = 2, onHand = 10) => {
  const variantId = await seedVariant(adminCookie, suffix, onHand);
  const result = await createOrder(
    {
      lines: [{ variantId, qty }],
      currency: Currency.MXN,
      customer: validCustomer,
      shipping: validShipping,
      idempotencyKey: uniqueKey(),
    },
    {},
  );
  const order = await Order.findOne({ publicId: result.order.publicId });
  return { order: order!, variantId, qty };
};

const backdateReservation = async (orderId: mongoose.Types.ObjectId, minutesAgo = 5): Promise<void> => {
  await StockReservation.updateOne(
    { order: orderId },
    { $set: { expiresAt: new Date(Date.now() - minutesAgo * 60 * 1000) } },
  );
};

beforeEach(() => {
  mockGetPayment.mockReset();
  mockCancel.mockReset();
  mockCancel.mockResolvedValue(undefined);
  intentCounter = 0;
});

describe("expireReservations", () => {
  it("libera una reserva vencida y marca la orden expired", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "E1", 3, 10);
    await backdateReservation(order._id);

    const result = await expireReservations();
    expect(result.released).toBe(1);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.EXPIRED);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
    expect(variant?.onHand).toBe(10);
  });

  it("no toca una reserva que no ha vencido", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "E2", 2, 10);

    const result = await expireReservations();
    expect(result.released).toBe(0);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.PENDING_PAYMENT);
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(2);
  });

  it("no toca una reserva ya committed aunque esté vencida (el stock ya salió)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "E3", 2, 10);
    const { applyPaymentSucceeded } = await import("../../src/services/orderPaymentService.js");
    await applyPaymentSucceeded(order._id);
    await backdateReservation(order._id);

    const result = await expireReservations();
    expect(result.released).toBe(0);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(8); // committed: 10 - 2
    expect(variant?.reserved).toBe(0);
    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.PAID);
  });

  it("una reserva vencida cuya orden no existe se libera igual, sin lanzar", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "E4", 10);
    const ghostOrderId = new mongoose.Types.ObjectId();
    await StockReservation.create({
      order: ghostOrderId,
      lines: [{ variant: new mongoose.Types.ObjectId(variantId), qty: 1 }],
      status: ReservationStatus.ACTIVE,
      expiresAt: new Date(Date.now() - 5 * 60 * 1000),
      purgeAt: null,
    });
    await Variant.updateOne({ _id: variantId }, { $set: { reserved: 1 } });

    await expect(expireReservations()).resolves.toMatchObject({ released: 1 });

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
  });

  it("una reserva vencida cuya orden ya está cancelled libera el stock sin reintentar la transición", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "E5", 2, 10);
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.CANCELLED } });
    await backdateReservation(order._id);

    await expireReservations();

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.CANCELLED); // untouched, still cancelled
  });

  it("procesa varias reservas vencidas en un solo pase", async () => {
    const adminCookie = await loginAsAdmin(app);
    const a = await seedOrder(adminCookie, "E6A", 1, 10);
    const b = await seedOrder(adminCookie, "E6B", 1, 10);
    const c = await seedOrder(adminCookie, "E6C", 1, 10);
    await Promise.all([
      backdateReservation(a.order._id),
      backdateReservation(b.order._id),
      backdateReservation(c.order._id),
    ]);

    const result = await expireReservations();
    expect(result.released).toBe(3);
  });

  it("es idempotente: correr el job dos veces no libera stock de más", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "E7", 2, 10);
    await backdateReservation(order._id);

    await expireReservations();
    const secondPass = await expireReservations();

    expect(secondPass.released).toBe(0);
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
    expect(variant?.onHand).toBe(10);
  });
});

describe("reconcilePayments", () => {
  // Mongoose's timestamps plugin protects `createdAt` from being changed via
  // Model.updateOne (it strips it back out on update queries, on purpose —
  // that guard is exactly what stops a normal business update from clobbering
  // the original creation time). Backdating for this fixture goes through the
  // raw driver instead, bypassing that Mongoose-level protection deliberately.
  const ageOrder = async (orderId: mongoose.Types.ObjectId, minutesAgo: number): Promise<void> => {
    await Order.collection.updateOne(
      { _id: orderId },
      { $set: { createdAt: new Date(Date.now() - minutesAgo * 60 * 1000) } },
    );
  };

  it("orden vieja cuyo intent está succeeded en el proveedor queda paid y la reserva committed", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId, qty } = await seedOrder(adminCookie, "RC1", 2, 10);
    await ageOrder(order._id, 30);
    mockGetPayment.mockResolvedValue({
      providerId: order.payment.intentId,
      status: PaymentStatus.SUCCEEDED,
      amount: 1,
      currency: Currency.MXN,
    });

    const result = await reconcilePayments();
    expect(result.settled).toBe(1);

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.PAID);
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(10 - qty);
    expect(variant?.reserved).toBe(0);
  });

  it("intent canceled deja la orden cancelled y libera el stock", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "RC2", 2, 10);
    await ageOrder(order._id, 30);
    mockGetPayment.mockResolvedValue({
      providerId: order.payment.intentId,
      status: PaymentStatus.CANCELLED,
      amount: 1,
      currency: Currency.MXN,
    });

    await reconcilePayments();

    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.CANCELLED);
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
  });

  it("intent aún requires_payment: sin cambios", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "RC3", 1, 10);
    await ageOrder(order._id, 30);
    mockGetPayment.mockResolvedValue({
      providerId: order.payment.intentId,
      status: PaymentStatus.REQUIRES_PAYMENT,
      amount: 1,
      currency: Currency.MXN,
    });

    const result = await reconcilePayments();
    expect(result.settled).toBe(0);
    const updated = await Order.findById(order._id).lean();
    expect(updated?.status).toBe(OrderStatus.PENDING_PAYMENT);
  });

  it("una orden reciente (dentro del período de gracia) no se toca", async () => {
    const adminCookie = await loginAsAdmin(app);
    await seedOrder(adminCookie, "RC4", 1, 10); // fresh createdAt, no aging

    const result = await reconcilePayments();
    expect(result.checked).toBe(0);
    expect(mockGetPayment).not.toHaveBeenCalled();
  });

  it("una orden ya paid no se consulta al proveedor", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "RC5", 1, 10);
    const { applyPaymentSucceeded } = await import("../../src/services/orderPaymentService.js");
    await applyPaymentSucceeded(order._id);
    await ageOrder(order._id, 30);

    const result = await reconcilePayments();
    expect(result.checked).toBe(0);
    expect(mockGetPayment).not.toHaveBeenCalled();
  });

  it("un error del proveedor en una orden no detiene el procesamiento de las demás", async () => {
    const adminCookie = await loginAsAdmin(app);
    const bad = await seedOrder(adminCookie, "RC6A", 1, 10);
    const good = await seedOrder(adminCookie, "RC6B", 1, 10);
    await ageOrder(bad.order._id, 30);
    await ageOrder(good.order._id, 30);

    mockGetPayment.mockImplementation((intentId: string) => {
      if (intentId === bad.order.payment.intentId) {
        return Promise.reject(new Error("provider outage"));
      }
      return Promise.resolve({
        providerId: intentId,
        status: PaymentStatus.SUCCEEDED,
        amount: 1,
        currency: Currency.MXN,
      });
    });

    const result = await reconcilePayments();
    expect(result.checked).toBe(2);
    expect(result.settled).toBe(1);

    const goodOrder = await Order.findById(good.order._id).lean();
    expect(goodOrder?.status).toBe(OrderStatus.PAID);
    const badOrder = await Order.findById(bad.order._id).lean();
    expect(badOrder?.status).toBe(OrderStatus.PENDING_PAYMENT);
  });
});

/**
 * La ventana para cobrar es exactamente la ventana en la que se apartó el
 * stock. Pasada esa ventana el inventario ya volvió a estar a la venta y el
 * precio pudo moverse, así que el intent debe quedar cancelado en el proveedor:
 * si el cliente pudiera confirmarlo una hora después, estaríamos cobrando algo
 * que ya no podemos surtir al precio que se le mostró.
 */
describe("expireReservations · cierre de la ventana de cobro", () => {
  it("cancela el PaymentIntent de la orden que expira", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "CANCEL1");
    await backdateReservation(order._id);

    await expireReservations();

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith(order.payment.intentId);
    const expired = await Order.findById(order._id).lean();
    expect(expired?.status).toBe(OrderStatus.EXPIRED);
  });

  it("si el proveedor rechaza la cancelación, la orden igual expira y el stock vuelve", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId, qty } = await seedOrder(adminCookie, "CANCEL2");
    await backdateReservation(order._id);
    mockCancel.mockRejectedValue(new Error("provider outage"));

    await expireReservations();

    const expired = await Order.findById(order._id).lean();
    expect(expired?.status).toBe(OrderStatus.EXPIRED);
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
    expect(variant?.onHand).toBe(10 - 0);
    // Queda constancia de que ese intent sigue vivo y necesita una mano.
    const audit = await AuditLog.findOne({
      action: "payment_cancel_failed",
      targetId: String(order._id),
    }).lean();
    expect(audit).not.toBeNull();
    void qty;
  });
});

/**
 * Las dos formas en que el dinero y el inventario podían quedar desalineados
 * sin dejar rastro. Ninguna mueve la orden por su cuenta: qué hacer con un
 * cobro sobre un pedido muerto es una decisión de negocio, y el trabajo del
 * código es que un humano se entere, no adivinar.
 */
describe("carrera entre la expiración y el cobro", () => {
  it("un pago que llega sobre una orden ya expirada no la revive: audita y alerta al equipo", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "RACE1");
    await backdateReservation(order._id);
    await expireReservations();

    // El webhook llega tarde, con la orden ya expirada.
    await applyPaymentSucceeded(order._id);

    const after = await Order.findById(order._id).lean();
    expect(after?.status).toBe(OrderStatus.EXPIRED);

    const audit = await AuditLog.findOne({
      action: "payment_after_expiry",
      targetId: String(order._id),
    }).lean();
    expect(audit).not.toBeNull();

    const alert = await Notification.findOne({
      type: "team_payment_needs_review",
      order: order._id,
    }).lean();
    expect(alert).not.toBeNull();
    expect(alert?.payload.reason).toBe("payment_after_expiry");

    // Y el stock liberado NO se vuelve a descontar por la puerta de atrás.
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
    expect(variant?.onHand).toBe(10);
  });

  it("si el apartado ya se liberó, el pago deja alerta de stock_commit_missed", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId, qty } = await seedOrder(adminCookie, "RACE2");
    // El barrido ganó la carrera y devolvió las unidades, pero la orden seguía
    // pending_payment cuando entró el webhook.
    await releaseReservation(order._id, "expired");

    await applyPaymentSucceeded(order._id);

    const after = await Order.findById(order._id).lean();
    expect(after?.status).toBe(OrderStatus.PAID);

    const audit = await AuditLog.findOne({
      action: "stock_commit_missed",
      targetId: String(order._id),
    }).lean();
    expect(audit).not.toBeNull();

    const alert = await Notification.findOne({
      type: "team_payment_needs_review",
      order: order._id,
    }).lean();
    expect(alert?.payload.reason).toBe("stock_commit_missed");

    // La orden quedó pagada SIN descontar stock: justo lo que la alerta denuncia.
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(10);
    expect(variant?.reserved).toBe(0);
    void qty;
  });
});

describe("expireReservations · alerta cuando no se puede cerrar el cobro", () => {
  it("cancelPendingCharge fallido: alerta TEAM sin ocupar el slot de needs_review de la orden", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "CANCEL3");
    await backdateReservation(order._id);
    mockCancel.mockRejectedValue(new Error("provider outage"));

    await expireReservations();

    const alert = await Notification.findOne({
      type: NotificationType.TEAM_PAYMENT_NEEDS_REVIEW,
      "payload.reason": "payment_cancel_failed",
    }).lean();
    expect(alert).not.toBeNull();
    expect(alert?.order).toBeUndefined();

    // The customer then pays the still-live intent: the MORE serious alarm must
    // not be swallowed as a duplicate of the cancel failure.
    await applyPaymentSucceeded(order._id);
    const late = await Notification.findOne({
      type: NotificationType.TEAM_PAYMENT_NEEDS_REVIEW,
      order: order._id,
    }).lean();
    expect(late?.payload.reason).toBe("payment_after_expiry");
  });

  it("un pago sobre una orden expirada queda registrado en la orden (payment.status y paidAt) sin revivirla", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "LATE1");
    await backdateReservation(order._id);
    await expireReservations();

    await applyPaymentSucceeded(order._id);
    await applyPaymentSucceeded(order._id); // retry: still one alert, still expired

    const after = await Order.findById(order._id).lean();
    expect(after?.status).toBe(OrderStatus.EXPIRED);
    expect(after?.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(after?.paidAt).toBeInstanceOf(Date);
    expect(
      await Notification.countDocuments({
        order: order._id,
        type: NotificationType.TEAM_PAYMENT_NEEDS_REVIEW,
      }),
    ).toBe(1);
  });
});

describe("expireReservations vs. un pago concurrente", () => {
  it("orden ya pagada con la reserva vencida y aún ACTIVE: el job no toca ni la orden ni la reserva", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "CONC1");
    // The webhook won the race and moved the order to paid, but its commit has not run yet.
    await applyOrderTransition({
      orderId: order._id,
      from: OrderStatus.PENDING_PAYMENT,
      to: OrderStatus.PAID,
      actor: { type: "system" },
    });
    await backdateReservation(order._id);

    const { released } = await expireReservations();

    expect(released).toBe(0);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.PAID);
    expect((await StockReservation.findOne({ order: order._id }).lean())?.status).toBe(
      ReservationStatus.ACTIVE,
    );
    expect((await Variant.findById(variantId).lean())?.reserved).toBe(2);

    // And the pending commit still lands afterwards, with no false alert.
    await applyPaymentSucceeded(order._id);
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(8);
    expect(variant?.reserved).toBe(0);
    expect(await AuditLog.countDocuments({ action: "stock_commit_missed" })).toBe(0);
  });
});

describe("applyPaymentSucceeded · efectos posteriores a PAID son re-ejecutables", () => {
  it("si commitReservation lanza tras pasar a paid: alerta, propaga, y el reintento completa commit y avisos", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "RETRY1");
    const spy = vi
      .spyOn(StockReservation, "findOneAndUpdate")
      .mockRejectedValueOnce(new Error("mongo down"));

    try {
      await expect(applyPaymentSucceeded(order._id)).rejects.toThrow("mongo down");
    } finally {
      spy.mockRestore();
    }
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.PAID);
    expect(await AuditLog.countDocuments({ action: "stock_commit_failed" })).toBe(1);
    expect((await Variant.findById(variantId).lean())?.onHand).toBe(10);

    // Stripe redelivers: the order is already paid, and the job still gets finished.
    await applyPaymentSucceeded(order._id);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(8);
    expect(variant?.reserved).toBe(0);
    expect((await Order.findById(order._id).lean())?.stockCommittedAt).toBeInstanceOf(Date);
    expect(
      await Notification.countDocuments({ order: order._id, type: NotificationType.ORDER_CONFIRMATION }),
    ).toBe(1);
    expect(
      await Notification.countDocuments({ order: order._id, type: NotificationType.TEAM_ORDER_PAID }),
    ).toBe(1);
    // The retry found the stock committed: no false "commit missed" alarm.
    expect(await AuditLog.countDocuments({ action: "stock_commit_missed" })).toBe(0);
  });
});

describe("escrituras de payment que no pisan al webhook", () => {
  it("payment_failed sobre una orden que ya está paid no toca payment.status", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "FAIL1");
    await applyPaymentSucceeded(order._id);

    await applyPaymentFailed(order._id, "card_declined");

    const after = await Order.findById(order._id).lean();
    expect(after?.status).toBe(OrderStatus.PAID);
    expect(after?.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(after?.payment.lastError).toBeUndefined();
  });

  it("createOrder: un webhook que paga antes de que termine el alta no es pisado por la escritura final", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "FAST1", 10);
    // The provider call returns only after the webhook already paid the order.
    mockCreate.mockImplementationOnce(async (input: { metadata: { orderId: string } }) => {
      await applyPaymentSucceeded(new mongoose.Types.ObjectId(input.metadata.orderId));
      return {
        providerId: "pi_fast_1",
        status: PaymentStatus.REQUIRES_PAYMENT,
        amount: 1,
        currency: Currency.MXN,
        clientSecret: "secret_stub",
      };
    });

    const result = await createOrder(
      {
        lines: [{ variantId, qty: 1 }],
        currency: Currency.MXN,
        customer: validCustomer,
        shipping: validShipping,
        idempotencyKey: uniqueKey(),
      },
      {},
    );

    const after = await Order.findOne({ publicId: result.order.publicId }).lean();
    expect(after?.status).toBe(OrderStatus.PAID);
    expect(after?.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(after?.payment.intentId).toBe("pi_fast_1");
  });
});

/**
 * Una orden pagada cuyos efectos (commit, correos, carrito) fallaron a medias no
 * la visita nadie más: ya no es `pending_payment`, así que el primer barrido la
 * ignora. El segundo la recoge por `paidEffectsAt` ausente.
 */
describe("reconcilePayments · efectos post-pago pendientes", () => {
  const ageOrder = async (orderId: mongoose.Types.ObjectId, minutesAgo: number): Promise<void> => {
    await Order.collection.updateOne(
      { _id: orderId },
      { $set: { createdAt: new Date(Date.now() - minutesAgo * 60 * 1000) } },
    );
  };
  const agePaidAt = async (orderId: mongoose.Types.ObjectId, minutesAgo: number): Promise<void> => {
    await Order.collection.updateOne(
      { _id: orderId },
      { $set: { paidAt: new Date(Date.now() - minutesAgo * 60 * 1000) } },
    );
  };

  it("un encolado estricto fallido deja la orden paid sin paidEffectsAt; la siguiente corrida lo completa una sola vez", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "RE1", 1, 10);
    await ageOrder(order._id, 30);
    mockGetPayment.mockResolvedValue({
      providerId: order.payment.intentId,
      status: PaymentStatus.SUCCEEDED,
      amount: 1,
      currency: Currency.MXN,
    });
    const spy = vi.spyOn(Notification, "create").mockRejectedValueOnce(new Error("db down") as never);

    await reconcilePayments();
    spy.mockRestore();

    const stuck = await Order.findById(order._id).lean();
    expect(stuck?.status).toBe(OrderStatus.PAID);
    expect(stuck?.paidEffectsAt).toBeUndefined();

    await agePaidAt(order._id, 20);
    await reconcilePayments();

    const healed = await Order.findById(order._id).lean();
    expect(healed?.paidEffectsAt).toBeInstanceOf(Date);
    const confirmations = await Notification.countDocuments({
      order: order._id,
      type: "order_confirmation",
    });
    expect(confirmations).toBe(1);
  });

  it("una orden pagada hace más de 3 días sin flag (anterior a M8.2) no se reprocesa", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "RE2", 1, 10);
    await applyPaymentSucceeded(order._id);
    await Order.collection.updateOne(
      { _id: order._id },
      { $unset: { paidEffectsAt: "" }, $set: { paidAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) } },
    );

    await reconcilePayments();

    expect((await Order.findById(order._id).lean())?.paidEffectsAt).toBeUndefined();
  });

  it("una orden pagada hace menos del período de gracia no se reprocesa todavía", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "RE3", 1, 10);
    await applyPaymentSucceeded(order._id);
    await Order.collection.updateOne({ _id: order._id }, { $unset: { paidEffectsAt: "" } });

    await reconcilePayments();

    expect((await Order.findById(order._id).lean())?.paidEffectsAt).toBeUndefined();
  });
});

describe("carrito · se vacía al pagar, no al crear la orden", () => {
  const seedCartOrder = async (adminCookie: string, suffix: string, useCart: boolean) => {
    const { setCartLine, getCart } = await import("../../src/services/cartService.js");
    const variantId = await seedVariant(adminCookie, suffix, 10);
    const userId = new mongoose.Types.ObjectId();
    await setCartLine(userId, variantId, 2);
    const result = await createOrder(
      {
        ...(useCart ? { useCart: true } : { lines: [{ variantId, qty: 2 }] }),
        currency: Currency.MXN,
        customer: validCustomer,
        shipping: validShipping,
        idempotencyKey: uniqueKey(),
      },
      { userId },
    );
    const order = await Order.findOne({ publicId: result.order.publicId });
    return { order: order!, userId, getCart };
  };

  it("al pagar una orden que salió del carrito, el carrito queda vacío y paidEffectsAt fijado", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, userId, getCart } = await seedCartOrder(adminCookie, "CT1", true);
    expect((await getCart(userId)).lines).toHaveLength(1);

    await applyPaymentSucceeded(order._id);

    expect((await getCart(userId)).lines).toEqual([]);
    expect((await Order.findById(order._id).lean())?.paidEffectsAt).toBeInstanceOf(Date);
  });

  it("al pagar una compra directa el carrito no se toca", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, userId, getCart } = await seedCartOrder(adminCookie, "CT2", false);

    await applyPaymentSucceeded(order._id);

    expect((await getCart(userId)).lines).toHaveLength(1);
  });

  it("reentregar el pago no vuelve a vaciar lo que el cliente agregó después", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, userId, getCart } = await seedCartOrder(adminCookie, "CT3", true);
    await applyPaymentSucceeded(order._id);
    const { setCartLine } = await import("../../src/services/cartService.js");
    const other = await seedVariant(adminCookie, "CT3B", 10);
    await setCartLine(userId, other, 1);

    await applyPaymentSucceeded(order._id);

    expect((await getCart(userId)).lines).toHaveLength(1);
  });
});

describe("expireReservations · aftermath antes de liberar", () => {
  it("si liberar la reserva lanza, el intent ya quedó cancelado y la siguiente pasada libera", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order, variantId } = await seedOrder(adminCookie, "AF1", 2, 10);
    await backdateReservation(order._id);
    const spy = vi
      .spyOn(StockReservation, "findOneAndUpdate")
      .mockRejectedValueOnce(new Error("db blip") as never);

    await expireReservations();
    spy.mockRestore();

    expect(mockCancel).toHaveBeenCalledWith(order.payment.intentId);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.EXPIRED);
    expect((await Variant.findById(variantId).lean())?.reserved).toBe(2);

    const second = await expireReservations();

    expect(second.released).toBe(1);
    expect((await Variant.findById(variantId).lean())?.reserved).toBe(0);
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });
});

describe("flagForReview · auditoría sin duplicados", () => {
  it("repetir la misma alerta por orden deja una sola auditoría", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "FR1", 1, 10);
    const { flagForReview } = await import("../../src/services/paymentAlertService.js");
    const { AuditAction } = await import("@gira/shared");

    await flagForReview(order, "stock_commit_missed", AuditAction.STOCK_COMMIT_MISSED);
    await flagForReview(order, "stock_commit_missed", AuditAction.STOCK_COMMIT_MISSED);

    expect(
      await AuditLog.countDocuments({ action: AuditAction.STOCK_COMMIT_MISSED, targetId: String(order._id) }),
    ).toBe(1);
    expect(await Notification.countDocuments({ order: order._id })).toBe(1);
  });

  it("una razón distinta sobre la misma orden (slot ocupado) sí deja su propia auditoría", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "FR2", 1, 10);
    const { flagForReview } = await import("../../src/services/paymentAlertService.js");
    const { AuditAction } = await import("@gira/shared");

    await flagForReview(order, "stock_commit_failed", AuditAction.STOCK_COMMIT_FAILED);
    await flagForReview(order, "payment_after_expiry", AuditAction.PAYMENT_AFTER_EXPIRY);

    expect(await AuditLog.countDocuments({ action: AuditAction.PAYMENT_AFTER_EXPIRY, targetId: String(order._id) })).toBe(1);
  });

  it("si el encolado no estricto falla, la auditoría se escribe de todos modos", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { order } = await seedOrder(adminCookie, "FR3", 1, 10);
    const { flagForReview } = await import("../../src/services/paymentAlertService.js");
    const { AuditAction } = await import("@gira/shared");
    const spy = vi.spyOn(Notification, "create").mockRejectedValueOnce(new Error("db down") as never);

    await flagForReview(order, "stock_commit_failed", AuditAction.STOCK_COMMIT_FAILED);
    spy.mockRestore();

    expect(await AuditLog.countDocuments({ action: AuditAction.STOCK_COMMIT_FAILED, targetId: String(order._id) })).toBe(1);
  });
});
