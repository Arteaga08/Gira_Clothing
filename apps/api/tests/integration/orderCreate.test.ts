import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { AuditAction, Currency, OrderStatus, ReservationStatus } from "@gira/shared";
import { Variant } from "../../src/models/Variant.js";
import { Product } from "../../src/models/Product.js";
import { Order } from "../../src/models/Order.js";
import { StockReservation } from "../../src/models/StockReservation.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const { getFailFlag, setShouldFail } = vi.hoisted(() => {
  let shouldFail = false;
  return {
    getFailFlag: () => shouldFail,
    setShouldFail: (value: boolean) => {
      shouldFail = value;
    },
  };
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

const { createOrder } = await import("../../src/services/orderService.js");
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
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: opts.basePrice ?? 15000 });
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
  city: "CDMX",
  state: "CDMX",
  postalCode: "01000",
  country: "MX",
};

const validCustomer = { email: "cliente@example.com", name: "Ana Pérez" };

const uniqueKey = (): string => `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;

afterEach(() => {
  setShouldFail(false);
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

    const { getCart } = await import("../../src/services/cartService.js");
    const cart = await getCart(userId);
    expect(cart.lines).toEqual([]);
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

    const count = await Order.countDocuments({ idempotencyKey: key });
    expect(count).toBe(1);
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
      },
      {},
    );

    const created = await AuditLog.countDocuments({
      action: AuditAction.ORDER_CREATED,
      targetId: result.order.publicId,
    });
    const paymentCreated = await AuditLog.countDocuments({
      action: AuditAction.PAYMENT_INTENT_CREATED,
      targetId: result.order.publicId,
    });
    expect(created).toBe(1);
    expect(paymentCreated).toBe(1);
  });
});
