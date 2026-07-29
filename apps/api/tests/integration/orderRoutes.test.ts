import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Order } from "../../src/models/Order.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

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
  city: "CDMX",
  state: "CDMX",
  postalCode: "01000",
  country: "MX",
};

const validCustomer = { email: "cliente@example.com", name: "Ana Pérez" };

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
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 12000 });
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

const uniqueKey = (): string => `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("Order routes · checkout", () => {
  it("POST /orders anónimo con lines responde 201", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R1");

    const res = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", uniqueKey())
      .send({
        lines: [{ variantId, qty: 1 }],
        customer: validCustomer,
        shipping: validShipping,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.order.publicId).toBeDefined();
    expect(res.body.data.clientSecret).toBeDefined();
  });

  it("POST /orders con cookie de cliente y useCart responde 201", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R2");
    const customerCookie = await loginAsCustomer(app);

    await request(app)
      .put(`/api/v1/cart/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 1 });

    const res = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .set("Idempotency-Key", uniqueKey())
      .send({ useCart: true, customer: validCustomer, shipping: validShipping });

    expect(res.status).toBe(201);
  });

  it("sin Origin responde 403 (verifyOrigin)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R3");

    const res = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", "http://evil.example.com")
      .set("Idempotency-Key", uniqueKey())
      .send({ lines: [{ variantId, qty: 1 }], customer: validCustomer, shipping: validShipping });

    expect(res.status).toBe(403);
  });

  it("sin Idempotency-Key responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R4");

    const res = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .send({ lines: [{ variantId, qty: 1 }], customer: validCustomer, shipping: validShipping });

    expect(res.status).toBe(400);
  });

  it("lines vacías responde 400", async () => {
    const res = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", uniqueKey())
      .send({ lines: [], customer: validCustomer, shipping: validShipping });
    expect(res.status).toBe(400);
  });

  it("email de cliente inválido responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R5");
    const res = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", uniqueKey())
      .send({
        lines: [{ variantId, qty: 1 }],
        customer: { email: "no-es-email", name: "Ana" },
        shipping: validShipping,
      });
    expect(res.status).toBe(400);
  });

  it("sin dirección de envío responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R6");
    const res = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", uniqueKey())
      .send({ lines: [{ variantId, qty: 1 }], customer: validCustomer });
    expect(res.status).toBe(400);
  });

  it("total/unitPrice enviados por el cliente se ignoran (stripUnknown)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "R7");
    const res = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", uniqueKey())
      .send({
        lines: [{ variantId, qty: 1, unitPrice: 1 }],
        customer: validCustomer,
        shipping: validShipping,
        total: 1,
      });
    expect(res.status).toBe(201);
    // Server-computed total: subtotal (12000) + national shipping (15000
    // default) — never the fake `total: 1` the client sent.
    expect(res.body.data.order.total).toBe(27000);
    expect(res.body.data.order.lines[0].unitPrice).toBe(12000);
  });
});

describe("Order routes · consulta pública", () => {
  it("GET /orders/:publicId sin sesión responde 200 con la orden", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "P1");
    const created = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", uniqueKey())
      .send({ lines: [{ variantId, qty: 1 }], customer: validCustomer, shipping: validShipping });
    const publicId = created.body.data.order.publicId as string;

    const res = await request(app).get(`${ORDERS_BASE}/${publicId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.order.publicId).toBe(publicId);
  });

  it("publicId inexistente responde 404", async () => {
    const fakeId = "a".repeat(43);
    const res = await request(app).get(`${ORDERS_BASE}/${fakeId}`);
    expect(res.status).toBe(404);
  });

  it("no filtra idempotencyKey, payment.intentId, user ni _id", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "P2");
    const created = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", uniqueKey())
      .send({ lines: [{ variantId, qty: 1 }], customer: validCustomer, shipping: validShipping });
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
    const customerA = await loginAsCustomer(app);
    const customerB = await loginAsCustomer(app);

    await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", customerA)
      .set("Idempotency-Key", uniqueKey())
      .send({ lines: [{ variantId, qty: 1 }], customer: validCustomer, shipping: validShipping });
    await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", customerB)
      .set("Idempotency-Key", uniqueKey())
      .send({ lines: [{ variantId, qty: 1 }], customer: validCustomer, shipping: validShipping });

    const res = await request(app).get(`${ORDERS_BASE}/mine`).set("Cookie", customerA);
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it("ignora ?user= del cliente: nunca devuelve órdenes de otro", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "M2");
    const customerA = await loginAsCustomer(app);
    const customerB = await loginAsCustomer(app);

    await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", customerB)
      .set("Idempotency-Key", uniqueKey())
      .send({ lines: [{ variantId, qty: 1 }], customer: validCustomer, shipping: validShipping });

    const res = await request(app)
      .get(`${ORDERS_BASE}/mine?user=someone-else`)
      .set("Cookie", customerA);
    expect(res.body.data.orders).toEqual([]);
  });
});

describe("Order routes · ownership de /mine/:id", () => {
  it("id de una orden ajena responde 404", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedVariant(adminCookie, "O1");
    const customerA = await loginAsCustomer(app);
    const customerB = await loginAsCustomer(app);

    const created = await request(app)
      .post(ORDERS_BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", customerB)
      .set("Idempotency-Key", uniqueKey())
      .send({ lines: [{ variantId, qty: 1 }], customer: validCustomer, shipping: validShipping });

    // /mine/:id uses the internal ObjectId, not publicId.
    const doc = await Order.findOne({ publicId: created.body.data.order.publicId }).lean();

    const res = await request(app)
      .get(`${ORDERS_BASE}/mine/${String(doc!._id)}`)
      .set("Cookie", customerA);
    expect(res.status).toBe(404);
  });
});

describe("Order routes · rate limiting", () => {
  afterEach(() => {
    process.env.NODE_ENV = "test";
  });

  it("el checkoutLimiter bloquea tras superar el máximo (en producción)", async () => {
    process.env.NODE_ENV = "production";
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app)
        .post(ORDERS_BASE)
        .set("Origin", ORIGIN)
        .send({}); // invalid payload is fine — the limiter runs before validation
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it("el orderLookupLimiter bloquea tras superar el máximo (en producción)", async () => {
    process.env.NODE_ENV = "production";
    let last = 0;
    for (let i = 0; i < 31; i += 1) {
      const res = await request(app).get(`${ORDERS_BASE}/${"b".repeat(43)}`);
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
