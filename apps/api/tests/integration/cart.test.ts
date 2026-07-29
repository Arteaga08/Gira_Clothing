import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Product } from "../../src/models/Product.js";
import { Cart } from "../../src/models/Cart.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATEGORIES_BASE = "/api/v1/admin/product-categories";
const PRODUCTS_BASE = "/api/v1/admin/products";
const VARIANTS_BASE = "/api/v1/admin/variants";
const CART_BASE = "/api/v1/cart";

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
  opts: { basePrice?: number } = {},
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
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: opts.basePrice ?? 10000 });
  const productId = productRes.body.data.product.id as string;

  const variantRes = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ product: productId, print: printId, images: [validImage] });
  const variantId = variantRes.body.data.variant.id as string;

  await Variant.updateOne({ _id: variantId }, { $set: { onHand: 20 } });

  return { productId, variantId };
};

describe("Cart · autorización", () => {
  it("GET anónimo responde 401", async () => {
    const res = await request(app).get(CART_BASE);
    expect(res.status).toBe(401);
  });

  it("PUT anónimo responde 401", async () => {
    const res = await request(app)
      .put(`${CART_BASE}/lines/507f1f77bcf86cd799439011`)
      .set("Origin", ORIGIN)
      .send({ qty: 1 });
    expect(res.status).toBe(401);
  });

  it("DELETE anónimo responde 401", async () => {
    const res = await request(app).delete(CART_BASE).set("Origin", ORIGIN);
    expect(res.status).toBe(401);
  });
});

describe("Cart · lectura", () => {
  it("el primer GET devuelve carrito vacío", async () => {
    const customerCookie = await loginAsCustomer(app);
    const res = await request(app).get(CART_BASE).set("Cookie", customerCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.cart.lines).toEqual([]);
  });

  it("tras un PUT devuelve la línea con precio vivo y available", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "R1", { basePrice: 12000 });
    const customerCookie = await loginAsCustomer(app);

    await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 2 });

    const res = await request(app).get(CART_BASE).set("Cookie", customerCookie);
    expect(res.body.data.cart.lines).toHaveLength(1);
    const line = res.body.data.cart.lines[0];
    expect(line.qty).toBe(2);
    expect(line.unitPriceMxn).toBe(12000);
    expect(line.available).toBe(20);
    expect(line.isAvailable).toBe(true);
  });
});

describe("Cart · escritura", () => {
  it("PUT con la misma variante reemplaza la cantidad (no suma)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "W1");
    const customerCookie = await loginAsCustomer(app);

    await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 2 });
    const res = await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.cart.lines).toHaveLength(1);
    expect(res.body.data.cart.lines[0].qty).toBe(5);
  });

  it("PUT con qty 0 elimina la línea", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "W2");
    const customerCookie = await loginAsCustomer(app);

    await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 3 });
    const res = await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.cart.lines).toEqual([]);
  });

  it("qty -1 responde 400", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "W3");
    const customerCookie = await loginAsCustomer(app);
    const res = await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: -1 });
    expect(res.status).toBe(400);
  });

  it("qty 999 responde 400 (tope 20)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "W4");
    const customerCookie = await loginAsCustomer(app);
    const res = await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 999 });
    expect(res.status).toBe(400);
  });

  it("variante inexistente responde 400", async () => {
    const customerCookie = await loginAsCustomer(app);
    const res = await request(app)
      .put(`${CART_BASE}/lines/507f1f77bcf86cd799439011`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 1 });
    expect(res.status).toBe(400);
  });

  it("variante inactiva responde 409", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "W5");
    await Variant.updateOne({ _id: variantId }, { $set: { isActive: false } });
    const customerCookie = await loginAsCustomer(app);
    const res = await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 1 });
    expect(res.status).toBe(409);
  });
});

describe("Cart · borrado", () => {
  it("DELETE de una línea la quita sin afectar las demás", async () => {
    const adminCookie = await loginAsAdmin(app);
    const a = await seedVariant(adminCookie, "D1");
    const b = await seedVariant(adminCookie, "D2");
    const customerCookie = await loginAsCustomer(app);

    await request(app)
      .put(`${CART_BASE}/lines/${a.variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 1 });
    await request(app)
      .put(`${CART_BASE}/lines/${b.variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 1 });

    const res = await request(app)
      .delete(`${CART_BASE}/lines/${a.variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.cart.lines).toHaveLength(1);
    expect(res.body.data.cart.lines[0].variantId).toBe(b.variantId);
  });

  it("DELETE /cart vacía el carrito completo", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "D3");
    const customerCookie = await loginAsCustomer(app);

    await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 1 });

    const res = await request(app).delete(CART_BASE).set("Origin", ORIGIN).set("Cookie", customerCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.cart.lines).toEqual([]);
  });
});

describe("Cart · aislamiento", () => {
  it("el carrito de un usuario no aparece en el de otro", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "ISO1");
    const customerA = await loginAsCustomer(app);
    const customerB = await loginAsCustomer(app);

    await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerA)
      .send({ qty: 1 });

    const res = await request(app).get(CART_BASE).set("Cookie", customerB);
    expect(res.body.data.cart.lines).toEqual([]);
  });
});

describe("Cart · precio vivo", () => {
  it("cambiar product.basePrice se refleja en un GET posterior", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId, productId } = await seedVariant(adminCookie, "PR1", { basePrice: 5000 });
    const customerCookie = await loginAsCustomer(app);

    await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 1 });

    await Product.updateOne({ _id: productId }, { $set: { basePrice: 9999 } });

    const res = await request(app).get(CART_BASE).set("Cookie", customerCookie);
    expect(res.body.data.cart.lines[0].unitPriceMxn).toBe(9999);
  });
});

describe("Cart · disponibilidad", () => {
  it("una línea sin stock aparece con available:0 e isAvailable:false, sin romper la respuesta", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "AV1");
    const customerCookie = await loginAsCustomer(app);

    await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 1 });

    await Variant.updateOne({ _id: variantId }, { $set: { onHand: 0 } });

    const res = await request(app).get(CART_BASE).set("Cookie", customerCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.cart.lines[0].available).toBe(0);
    expect(res.body.data.cart.lines[0].isAvailable).toBe(false);
  });
});

describe("Cart · expiración", () => {
  it("cada escritura empuja expiresAt hacia el futuro", async () => {
    const adminCookie = await loginAsAdmin(app);
    const { variantId } = await seedVariant(adminCookie, "EX1");
    const customerCookie = await loginAsCustomer(app);

    const before = Date.now();
    await request(app)
      .put(`${CART_BASE}/lines/${variantId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", customerCookie)
      .send({ qty: 1 });

    const cart = await Cart.findOne({}).lean();
    expect(new Date(cart!.expiresAt).getTime()).toBeGreaterThan(before + 29 * 24 * 60 * 60 * 1000);
  });
});
