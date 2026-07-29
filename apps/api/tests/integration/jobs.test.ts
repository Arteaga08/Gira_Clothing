import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { Currency, OrderStatus, PaymentStatus, ReservationStatus } from "@gira/shared";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const { mockGetPayment, mockCreate } = vi.hoisted(() => ({
  mockGetPayment: vi.fn(),
  mockCreate: vi.fn(),
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
const { createOrder } = await import("../../src/services/orderService.js");
const { expireReservations } = await import("../../src/jobs/expireReservations.js");
const { reconcilePayments } = await import("../../src/jobs/reconcilePayments.js");
const { Order } = await import("../../src/models/Order.js");
const { Variant } = await import("../../src/models/Variant.js");
const { StockReservation } = await import("../../src/models/StockReservation.js");

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
  city: "CDMX",
  state: "CDMX",
  postalCode: "01000",
  country: "MX",
};
const validCustomer = { email: "cliente@example.com", name: "Ana Pérez" };
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
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 10000 });
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
