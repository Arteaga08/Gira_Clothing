import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { Product } from "../../src/models/Product.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";
import { seedCatalogVariant } from "../helpers/orders.js";

const app = buildApp();
const PREVIEW = "/api/v1/cart/preview";

const preview = (lines: unknown) =>
  request(app).post(PREVIEW).set("Origin", ORIGIN).send({ lines });

describe("Cart preview · visitante", () => {
  it("no pide sesión y devuelve las líneas con precio vivo y status", async () => {
    const adminCookie = await loginAsAdmin(app);
    const variantId = await seedCatalogVariant(app, adminCookie, "PV1");

    const res = await preview([{ variantId, qty: 2 }]);
    expect(res.status).toBe(200);
    expect(res.body.data.cart.lines).toHaveLength(1);
    expect(res.body.data.cart.lines[0]).toMatchObject({
      variantId,
      qty: 2,
      unitPriceMxn: 10000,
      status: "available",
      productName: "Producto PV1",
      printName: "Print PV1",
    });
  });

  it("marca out_of_stock y retired sin fallar la respuesta", async () => {
    const adminCookie = await loginAsAdmin(app);
    const soldOut = await seedCatalogVariant(app, adminCookie, "PV2", 0);
    const retired = await seedCatalogVariant(app, adminCookie, "PV3");
    const variant = await Variant.findById(retired).lean();
    await Product.updateOne({ _id: variant!.product }, { $set: { isActive: false } });

    const res = await preview([
      { variantId: soldOut, qty: 3 },
      { variantId: retired, qty: 1 },
    ]);
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(
      (res.body.data.cart.lines as { variantId: string; status: string }[]).map((l) => [l.variantId, l.status]),
    );
    expect(byId).toEqual({ [soldOut]: "out_of_stock", [retired]: "retired" });
  });

  it("una línea retirada no revela nombre, precio ni foto (el endpoint es público)", async () => {
    const adminCookie = await loginAsAdmin(app);
    const draft = await seedCatalogVariant(app, adminCookie, "PV6");
    await Variant.updateOne({ _id: draft }, { $set: { isActive: false } });

    const res = await preview([{ variantId: draft, qty: 2 }]);
    expect(res.body.data.cart.lines).toEqual([{ variantId: draft, qty: 2, status: "retired" }]);
  });

  it("la disponibilidad es la misma señal del catálogo (hay o no hay), nunca la cantidad", async () => {
    const adminCookie = await loginAsAdmin(app);
    const fewLeft = await seedCatalogVariant(app, adminCookie, "PV7", 2);

    const res = await preview([{ variantId: fewLeft, qty: 15 }]);
    expect(res.body.data.cart.lines[0].status).toBe("available");
  });

  it("una variante inexistente sale como retired con lo mínimo", async () => {
    const res = await preview([{ variantId: "507f1f77bcf86cd799439011", qty: 1 }]);
    expect(res.status).toBe(200);
    expect(res.body.data.cart.lines).toEqual([
      { variantId: "507f1f77bcf86cd799439011", qty: 1, status: "retired" },
    ]);
  });

  it("conserva el orden en que llegan las líneas", async () => {
    const adminCookie = await loginAsAdmin(app);
    const a = await seedCatalogVariant(app, adminCookie, "PV4");
    const b = await seedCatalogVariant(app, adminCookie, "PV5");
    const res = await preview([
      { variantId: b, qty: 1 },
      { variantId: a, qty: 1 },
    ]);
    expect(res.body.data.cart.lines.map((l: { variantId: string }) => l.variantId)).toEqual([b, a]);
  });

  it.each([
    ["sin líneas", []],
    ["id inválido", [{ variantId: "x", qty: 1 }]],
    ["qty 0", [{ variantId: "507f1f77bcf86cd799439011", qty: 0 }]],
    ["qty 21", [{ variantId: "507f1f77bcf86cd799439011", qty: 21 }]],
    [
      "variante repetida",
      [
        { variantId: "507f1f77bcf86cd799439011", qty: 1 },
        { variantId: "507f1f77bcf86cd799439011", qty: 2 },
      ],
    ],
    [
      "más de 30 líneas",
      Array.from({ length: 31 }, (_, i) => ({ variantId: `507f1f77bcf86cd7994390${String(i).padStart(2, "0")}`, qty: 1 })),
    ],
  ])("responde 400 con %s", async (_label, lines) => {
    const res = await preview(lines);
    expect(res.status).toBe(400);
  });
});
