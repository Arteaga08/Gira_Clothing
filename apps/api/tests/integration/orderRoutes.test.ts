import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Order } from "../../src/models/Order.js";
import { resetRateLimitStores } from "../../src/middlewares/rateLimit.js";
import { Types } from "mongoose";
import { Currency } from "@gira/shared";
import { createCustomer, loginAsAdmin, loginCustomer, ORIGIN } from "../helpers/auth.js";
import { quoteRateFor, withQuote } from "../helpers/orders.js";

const app = buildApp();

const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const PRODUCTS_BASE = "/api/v1/admin/products";
const VARIANTS_BASE = "/api/v1/admin/variants";
const ORDERS_BASE = "/api/v1/orders";

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

const seedVariant = async (adminCookie: string, suffix: string): Promise<string> => {
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
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 12000, weightGrams: 400 });
  const productId = productRes.body.data.product.id as string;

  const variantRes = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ product: productId, print: printId, images: [validImage] });
  const variantId = variantRes.body.data.variant.id as string;

  await Variant.updateOne({ _id: variantId }, { $set: { onHand: 20 } });
  return variantId;
};

// El endpoint exige un UUID: una clave con poca entropía sería adivinable, y
// adivinarla es lo que permitiría recuperar la orden de otra persona.
const uniqueKey = (): string => randomUUID();

interface Shopper {
  id: string;
  cookie: string;
}

/** Checkout is accounts-only (M16): every order is placed by a logged-in customer. */
const newShopper = async (): Promise<Shopper> => {
  const customer = await createCustomer();
  return { id: customer.id, cookie: await loginCustomer(app, customer) };
};

const orderBody = (variantId: string, extra: Record<string, unknown> = {}) => ({
  lines: [{ variantId, qty: 1 }],
  termsAccepted: true,
  customer: validCustomer,
  shipping: validShipping,
  ...extra,
});

const postOrder = (shopper: Shopper, body: Record<string, unknown>) =>
  request(app)
    .post(ORDERS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", shopper.cookie)
    .set("Idempotency-Key", uniqueKey())
    .send(body);

describe("Order routes · checkout", () => {
  it("POST /orders con sesión y lines responde 201", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R1");
    const shopper = await newShopper();

    const res = await postOrder(shopper, await withQuote(orderBody(variantId), shopper.id));

    expect(res.status).toBe(201);
    expect(res.body.data.order.publicId).toBeDefined();
    expect(res.body.data.clientSecret).toBeDefined();
  });

  it("POST /orders con cookie de cliente y useCart responde 201", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R2");
    const shopper = await newShopper();

    await request(app)
      .put(`/api/v1/cart/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", shopper.cookie)
      .send({ qty: 1 });

    const res = await postOrder(shopper, {
      useCart: true,
      termsAccepted: true,
      customer: validCustomer,
      shipping: validShipping,
      shippingQuote: await quoteRateFor(variantId, 1, Currency.MXN, new Types.ObjectId(shopper.id)),
    });

    expect(res.status).toBe(201);
  });

  it("sin Origin responde 403 (verifyOrigin)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R3");
    const shopper = await newShopper();

    const res = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", "http://evil.example.com")
      .set("Cookie", shopper.cookie)
      .set("Idempotency-Key", uniqueKey())
      .send(await withQuote(orderBody(variantId), shopper.id));

    expect(res.status).toBe(403);
  });

  it("sin Idempotency-Key responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R4");
    const shopper = await newShopper();

    const res = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", shopper.cookie)
      .send(await withQuote(orderBody(variantId), shopper.id));

    expect(res.status).toBe(400);
  });

  it("lines vacías responde 400", async () => {
    const shopper = await newShopper();
    const res = await postOrder(shopper, orderBody("", { lines: [] }));
    expect(res.status).toBe(400);
  });

  it("teléfono inválido responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R5");
    const shopper = await newShopper();
    const res = await postOrder(
      shopper,
      await withQuote(orderBody(variantId, { customer: { phone: "123" } }), shopper.id),
    );
    expect(res.status).toBe(400);
  });

  it("sin dirección de envío responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R6");
    const shopper = await newShopper();
    const res = await postOrder(shopper, {
      lines: [{ variantId, qty: 1 }],
      termsAccepted: true,
      customer: validCustomer,
    });
    expect(res.status).toBe(400);
  });

  it("total/unitPrice enviados por el cliente se ignoran (stripUnknown)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R7");
    const shopper = await newShopper();
    const res = await postOrder(
      shopper,
      await withQuote(
        orderBody(variantId, { lines: [{ variantId, qty: 1, unitPrice: 1 }], total: 1 }),
        shopper.id,
      ),
    );
    expect(res.status).toBe(201);
    // Server-computed total: subtotal (12000) + the quoted shipping (the stub's
    // cheapest rate, 12000) — never the fake `total: 1` the client sent.
    expect(res.body.data.order.total).toBe(24000);
    expect(res.body.data.order.lines[0].unitPrice).toBe(12000);
  });
});

describe("Order routes · consulta pública", () => {
  it("GET /orders/:publicId sin sesión responde 200 con la orden", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "P1");
    const shopper = await newShopper();
    const created = await postOrder(shopper, await withQuote(orderBody(variantId), shopper.id));
    const publicId = created.body.data.order.publicId as string;

    const res = await request(app).get(`${ORDERS_BASE}/${publicId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.order.publicId).toBe(publicId);
    // The publicId is the access credential; the internal id never goes out here.
    expect(res.body.data.order).not.toHaveProperty("id");
  });

  it("publicId inexistente responde 404", async () => {
    const fakeId = "a".repeat(43);
    const res = await request(app).get(`${ORDERS_BASE}/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it("no filtra idempotencyKey, payment.intentId, user ni _id", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "P2");
    const shopper = await newShopper();
    const created = await postOrder(shopper, await withQuote(orderBody(variantId), shopper.id));
    const publicId = created.body.data.order.publicId as string;

    const res = await request(app).get(`${ORDERS_BASE}/${publicId}`);
    const order = res.body.data.order;
    expect(order).not.toHaveProperty("idempotencyKey");
    expect(order).not.toHaveProperty("_id");
    expect(order).not.toHaveProperty("user");
    expect(order.payment).toBeUndefined();
    expect(order.publicId).toBeDefined();
    expect(order.lines).toBeDefined();
    expect(order.total).toBeDefined();
    expect(order.status).toBeDefined();
    expect(order.coupon).toBeNull();
  });
});

describe("Order routes · panel de usuario", () => {
  it("GET /orders/mine anónimo responde 401", async () => {
    const res = await request(app).get(`${ORDERS_BASE}/mine`);
    expect(res.status).toBe(401);
  });

  it("GET /orders/mine devuelve solo las órdenes propias, paginado", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "M1");
    const customerA = await newShopper();
    const customerB = await newShopper();

    await postOrder(customerA, await withQuote(orderBody(variantId), customerA.id));
    await postOrder(customerB, await withQuote(orderBody(variantId), customerB.id));

    const res = await request(app).get(`${ORDERS_BASE}/mine`).set("Cookie", customerA.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
    expect(typeof res.body.data.orders[0].id).toBe("string");

    const detail = await request(app)
      .get(`${ORDERS_BASE}/mine/${String(res.body.data.orders[0].id)}`)
      .set("Cookie", customerA.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.data.order.id).toBe(res.body.data.orders[0].id);
  });

  it("ignora ?user= del cliente: nunca devuelve órdenes de otro", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "M2");
    const customerA = await newShopper();
    const customerB = await newShopper();

    const created = await postOrder(customerB, await withQuote(orderBody(variantId), customerB.id));
    expect(created.status).toBe(201);

    const res = await request(app)
      .get(`${ORDERS_BASE}/mine?user=someone-else`)
      .set("Cookie", customerA.cookie);
    expect(res.body.data.orders).toEqual([]);
  });
});

describe("Order routes · ownership de /mine/:id", () => {
  it("id de una orden ajena responde 404", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "O1");
    const customerA = await newShopper();
    const customerB = await newShopper();

    const created = await postOrder(customerB, await withQuote(orderBody(variantId), customerB.id));

    // /mine/:id uses the internal ObjectId, not publicId.
    const doc = await Order.findOne({ publicId: created.body.data.order.publicId }).lean();

    const res = await request(app)
      .get(`${ORDERS_BASE}/mine/${String(doc!._id)}`)
      .set("Cookie", customerA.cookie);
    expect(res.status).toBe(404);
  });
});

describe("Order routes · rate limiting", () => {
  beforeEach(() => {
    process.env.RATE_LIMIT_ENABLED = "true";
    resetRateLimitStores();
  });
  afterEach(() => {
    process.env.RATE_LIMIT_ENABLED = "false";
  });

  it("el checkoutLimiter bloquea tras superar el máximo, por cliente (en producción)", async () => {
    const shopper = await newShopper();
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app)
        .post(ORDERS_BASE)
        .set("Origin", ORIGIN)
        .set("Cookie", shopper.cookie)
        .send({}); // invalid payload is fine — the limiter runs before validation
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it("el orderLookupLimiter bloquea tras superar el máximo (en producción)", async () => {
    let last = 0;
    for (let i = 0; i < 31; i += 1) {
      const res = await request(app).get(`${ORDERS_BASE}/${"b".repeat(43)}`);
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
