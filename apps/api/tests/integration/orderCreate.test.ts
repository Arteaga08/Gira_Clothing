import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import {
  AuditAction,
  Currency,
  ORDER_NUMBER_PATTERN,
  OrderStatus,
  ReservationStatus,
} from "@gira/shared";
import { Variant } from "../../src/models/Variant.js";
import { Product } from "../../src/models/Product.js";
import { Order } from "../../src/models/Order.js";
import { StockReservation } from "../../src/models/StockReservation.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { withQuote } from "../helpers/orders.js";
import { idempotencyOwner, scopeIdempotencyKey } from "../../src/utils/idempotency.js";

const { getFailFlag, setShouldFail } = vi.hoisted(() => {
  let shouldFail = false;
  return {
    getFailFlag: () => shouldFail,
    setShouldFail: (value: boolean) => {
      shouldFail = value;
    },
  };
});

// Lets a test force folio collisions: queued values are served first, then the real generator.
const { queueOrderNumbers, clearOrderNumbers, nextQueued } = vi.hoisted(() => {
  const queue: string[] = [];
  return {
    queueOrderNumbers: (...values: string[]) => {
      queue.push(...values);
    },
    clearOrderNumbers: () => {
      queue.length = 0;
    },
    nextQueued: () => queue.shift(),
  };
});

vi.mock("../../src/utils/orderNumber.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/orderNumber.js")>();
  return { ...actual, generateOrderNumber: () => nextQueued() ?? actual.generateOrderNumber() };
});

// Only createPayment is intercepted, and only when a test opts in via
// setShouldFail(true) — every other test still exercises the real stub
// adapter end to end (deterministic, no network).
vi.mock("../../src/adapters/payment/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/adapters/payment/index.js")>();
  return {
    ...actual,
    getPaymentProvider: () => {
      const real = actual.getPaymentProvider();
      return {
        ...real,
        createPayment: (...args: Parameters<typeof real.createPayment>) => {
          if (getFailFlag()) return Promise.reject(new Error("simulated provider outage"));
          return real.createPayment(...args);
        },
      };
    },
  };
});

const { createOrderWithQuote: createOrder } = await import("../helpers/orders.js");
const { setCartLine } = await import("../../src/services/cartService.js");

const app = (await import("../../src/app.js")).buildApp();

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

interface SeedResult {
  productId: string;
  variantId: string;
}

const seedVariant = async (
  adminCookie: string,
  suffix: string,
  opts: { basePrice?: number; onHand?: number } = {},
): Promise<SeedResult> => {
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
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: opts.basePrice ?? 15000, weightGrams: 400 });
  const productId = productRes.body.data.product.id as string;

  const variantRes = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ product: productId, print: printId, images: [validImage] });
  const variantId = variantRes.body.data.variant.id as string;

  await Variant.updateOne({ _id: variantId }, { $set: { onHand: opts.onHand ?? 10 } });

  return { productId, variantId };
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

afterEach(() => {
  setShouldFail(false);
  clearOrderNumbers();
});

describe("orderService.createOrder · camino feliz", () => {
  it("invitado con lines crea una orden pending_payment con publicId, reserva y clientSecret", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "H1");

    const result = await createOrder(
      {
        lines: [{ variantId, qty: 2 }],
        currency: Currency.MXN,
        customer: validCustomer,
        shipping: validShipping,
        idempotencyKey: uniqueKey(),
      },
      {},
    );

    expect(result.order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(result.order.publicId.length).toBeGreaterThanOrEqual(43);
    expect(result.clientSecret).toBeDefined();

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(2);

    const orderDoc = await Order.findOne({ publicId: result.order.publicId }).lean();
    const reservation = await StockReservation.findOne({ order: orderDoc?._id }).lean();
    expect(reservation?.status).toBe(ReservationStatus.ACTIVE);
  });
});

describe("orderService.createOrder · con cuenta", () => {
  it("useCart:true toma las líneas del carrito y lo vacía al crear la orden", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "C1");
    const customerCookie = await loginAsCustomer(app);

    // Extract the logged-in customer's id via /auth/me.
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", customerCookie);
    const userId = new mongoose.Types.ObjectId(me.body.data.user.id as string);

    await setCartLine(userId, variantId, 3);

    const result = await createOrder(
      {
        useCart: true,
        currency: Currency.MXN,
        customer: validCustomer,
        shipping: validShipping,
        idempotencyKey: uniqueKey(),
      },
      { userId },
    );

    expect(result.order.lines).toHaveLength(1);
    expect(result.order.lines[0]?.qty).toBe(3);

    const orderDoc = await Order.findOne({ publicId: result.order.publicId }).lean();
    expect(orderDoc?.user?.toString()).toBe(userId.toString());

    // The cart is emptied when the order is PAID, not when it is created.
    expect(orderDoc?.fromCart).toBe(true);
    const { getCart } = await import("../../src/services/cartService.js");
    const cart = await getCart(userId);
    expect(cart.lines).toHaveLength(1);
  });
});

describe("orderService.createOrder · snapshot", () => {
  it("persiste el precio y no se altera si el catálogo cambia después", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId, productId } = await seedVariant(adminCookie, "SN1", { basePrice: 8000 });

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
    expect(result.order.lines[0]?.unitPrice).toBe(8000);

    await Product.updateOne({ _id: productId }, { $set: { basePrice: 99999 } });

    const orderDoc = await Order.findOne({ publicId: result.order.publicId }).lean();
    expect(orderDoc?.lines[0]?.unitPriceMxn).toBe(8000);
  });
});

describe("orderService.createOrder · idempotencia", () => {
  it("el mismo idempotencyKey devuelve la misma orden sin reservar de nuevo", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "I1");
    const key = uniqueKey();

    const first = await createOrder(
      {
        lines: [{ variantId, qty: 1 }],
        currency: Currency.MXN,
        customer: validCustomer,
        shipping: validShipping,
        idempotencyKey: key,
      },
      {},
    );
    const second = await createOrder(
      {
        lines: [{ variantId, qty: 1 }],
        currency: Currency.MXN,
        customer: validCustomer,
        shipping: validShipping,
        idempotencyKey: key,
      },
      {},
    );

    expect(second.order.publicId).toBe(first.order.publicId);
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(1);
  });

  it("dos creaciones concurrentes con la misma key producen exactamente una orden", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "I2", { onHand: 5 });
    const key = uniqueKey();

    const input = {
      lines: [{ variantId, qty: 1 }],
      currency: Currency.MXN,
      customer: validCustomer,
      shipping: validShipping,
      idempotencyKey: key,
    };

    const [a, b] = await Promise.all([createOrder(input, {}), createOrder(input, {})]);
    expect(a.order.publicId).toBe(b.order.publicId);

    expect(await Order.countDocuments({})).toBe(1);
  });

  it("la clave del cliente nunca se guarda tal cual: se almacena acotada al comprador", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "I3");
    const key = uniqueKey();

    await createOrder(
      {
        lines: [{ variantId, qty: 1 }],
        currency: Currency.MXN,
        customer: validCustomer,
        shipping: validShipping,
        idempotencyKey: key,
      },
      {},
    );

    const stored = await Order.findOne({}).lean();
    expect(stored?.idempotencyKey).not.toBe(key);
    expect(stored?.idempotencyKey).toBe(
      scopeIdempotencyKey(key, idempotencyOwner(undefined, validCustomer.email)),
    );
    // Buscar por la clave cruda no encuentra nada: ese era el oráculo de A1.
    expect(await Order.countDocuments({ idempotencyKey: key })).toBe(0);
  });

  it("dos compradores distintos con la MISMA clave obtienen cada quien su orden", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "I4", { onHand: 5 });
    const sharedKey = uniqueKey();

    const victima = await createOrder(
      {
        lines: [{ variantId, qty: 1 }],
        currency: Currency.MXN,
        customer: { email: "victima@example.com", name: "Vic Tima", phone: "5511111111" },
        shipping: validShipping,
        idempotencyKey: sharedKey,
      },
      {},
    );

    const atacante = await createOrder(
      {
        lines: [{ variantId, qty: 1 }],
        currency: Currency.MXN,
        customer: { email: "atacante@example.com", name: "Ata Cante", phone: "5522222222" },
        shipping: validShipping,
        idempotencyKey: sharedKey,
      },
      {},
    );

    // Dos órdenes distintas: el atacante NO recibe el pedido de la víctima.
    expect(atacante.order.publicId).not.toBe(victima.order.publicId);
    expect(atacante.order.customer.email).toBe("atacante@example.com");
    expect(await Order.countDocuments({})).toBe(2);
  });
});

describe("orderService.createOrder · stock", () => {
  it("pedir más que el disponible responde 409 y no persiste nada", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "S1", { onHand: 2 });

    await expect(
      createOrder(
        {
          lines: [{ variantId, qty: 3 }],
          currency: Currency.MXN,
          customer: validCustomer,
          shipping: validShipping,
          idempotencyKey: uniqueKey(),
        },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    const orderCount = await Order.countDocuments({});
    expect(orderCount).toBe(0);
    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
  });

  it("pedir exactamente el disponible tiene éxito", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "S2", { onHand: 2 });

    const result = await createOrder(
      {
        lines: [{ variantId, qty: 2 }],
        currency: Currency.MXN,
        customer: validCustomer,
        shipping: validShipping,
        idempotencyKey: uniqueKey(),
      },
      {},
    );
    expect(result.order.status).toBe(OrderStatus.PENDING_PAYMENT);
  });
});

describe("orderService.createOrder · variante huérfana", () => {
  it("variante cuyo producto fue retirado responde 409 sin efectos", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId, productId } = await seedVariant(adminCookie, "O1");
    await Product.updateOne({ _id: productId }, { $set: { isActive: false } });

    await expect(
      createOrder(
        {
          lines: [{ variantId, qty: 1 }],
          currency: Currency.MXN,
          customer: validCustomer,
          shipping: validShipping,
          idempotencyKey: uniqueKey(),
        },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
  });
});

describe("orderService.createOrder · fallo del proveedor", () => {
  it("si createPayment falla, la reserva se libera y la orden queda cancelled", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "F1");

    setShouldFail(true);
    await expect(
      createOrder(
        {
          lines: [{ variantId, qty: 1 }],
          currency: Currency.MXN,
          customer: validCustomer,
          shipping: validShipping,
          idempotencyKey: uniqueKey(),
        },
        {},
      ),
    ).rejects.toThrow();

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);

    const order = await Order.findOne({}).sort({ createdAt: -1 }).lean();
    expect(order?.status).toBe(OrderStatus.CANCELLED);
    expect(order?.cancelReason).toBe("payment_setup_failed");
  });
});

describe("orderService.createOrder · auditoría", () => {
  it("crea un ORDER_CREATED y un PAYMENT_INTENT_CREATED", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "A1");

    const result = await createOrder(
      {
        lines: [{ variantId, qty: 1 }],
        currency: Currency.MXN,
        customer: validCustomer,
        shipping: validShipping,
        idempotencyKey: uniqueKey(),
        termsAccepted: true,
      },
      {},
    );

    const stored = await Order.findOne({ publicId: result.order.publicId });
    const targetId = String(stored!._id);
    const created = await AuditLog.countDocuments({
      action: AuditAction.ORDER_CREATED,
      targetId,
    });
    const paymentCreated = await AuditLog.countDocuments({
      action: AuditAction.PAYMENT_INTENT_CREATED,
      targetId,
    });
    expect(created).toBe(1);
    expect(paymentCreated).toBe(1);
  });
});

describe("M9a · checkout por HTTP", () => {
  const checkoutBody = (variantId: string, extra: Record<string, unknown> = {}) => ({
    lines: [{ variantId, qty: 1 }],
    currency: Currency.MXN,
    customer: validCustomer,
    shipping: validShipping,
    ...extra,
  });

  const postOrder = async (body: Record<string, unknown>) =>
    request(app)
      .post("/api/v1/orders")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send(await withQuote(body));

  it("devuelve folio y desglose de IVA, y sella termsAcceptedAt sin exponerlo", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "M9A1");

    const res = await postOrder(checkoutBody(variantId, { termsAccepted: true }));

    expect(res.status).toBe(201);
    const order = res.body.data.order as Record<string, unknown>;
    expect(order.orderNumber).toMatch(ORDER_NUMBER_PATTERN);
    expect(order.discount).toBe(0);
    expect(order.taxRateBps).toBe(1600);
    expect(order.tax as number).toBeGreaterThan(0);
    expect(order).not.toHaveProperty("termsAcceptedAt");

    const doc = await Order.findOne({ orderNumber: order.orderNumber as string });
    expect(doc?.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it("rechaza con 400 si no se aceptan los términos y no persiste nada", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "M9A2");

    const res = await postOrder(checkoutBody(variantId));

    expect(res.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
    expect(await StockReservation.countDocuments()).toBe(0);
  });

  it("termsAccepted:false también se rechaza", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "M9A3");

    const res = await postOrder(checkoutBody(variantId, { termsAccepted: false }));

    expect(res.status).toBe(400);
  });
});

describe("M9a · folio orderNumber", () => {
  const create = (variantId: string) =>
    createOrder(
      {
        lines: [{ variantId, qty: 1 }],
        currency: Currency.MXN,
        customer: validCustomer,
        shipping: validShipping,
        idempotencyKey: uniqueKey(),
        termsAccepted: true,
      },
      {},
    );

  it("reintenta con otro folio si el primero ya existe", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "FOL1", { onHand: 10 });
    const first = await create(variantId);

    queueOrderNumbers(first.order.orderNumber, first.order.orderNumber);
    const second = await create(variantId);

    expect(second.order.orderNumber).not.toBe(first.order.orderNumber);
    expect(second.order.orderNumber).toMatch(ORDER_NUMBER_PATTERN);
    expect(await Order.countDocuments()).toBe(2);
  });

  it("tras 3 colisiones seguidas falla y libera la reserva", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "FOL2", { onHand: 10 });
    const first = await create(variantId);

    queueOrderNumbers(
      first.order.orderNumber,
      first.order.orderNumber,
      first.order.orderNumber,
    );
    await expect(create(variantId)).rejects.toMatchObject({ statusCode: 503 });

    expect(await Order.countDocuments()).toBe(1);
    expect(
      await StockReservation.countDocuments({ status: ReservationStatus.RELEASED }),
    ).toBe(1);
  });
});
