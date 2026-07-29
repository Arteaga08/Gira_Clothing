import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { AuditAction } from "@gira/shared";
import { ReservationStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Variant } from "../../src/models/Variant.js";
import { StockReservation } from "../../src/models/StockReservation.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { reserveStock, commitReservation, releaseReservation } from "../../src/services/reservationService.js";
import type { RequestContext } from "../../src/utils/requestContext.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

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

const CTX: RequestContext = {};

/** Creates a fresh Variant and sets its onHand directly (bypassing the atomic guard for setup speed). */
const seedVariant = async (cookie: string, suffix: string, onHand = 10): Promise<string> => {
  const familyRes = await request(app)
    .post(FAMILIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: `Familia ${suffix}` });
  const familyId = familyRes.body.data.family.id as string;

  const printRes = await request(app)
    .post(PRINTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: `Print ${suffix}`, sku: `SKU-${suffix}`, family: familyId, image: validImage });
  const printId = printRes.body.data.print.id as string;

  const categoryRes = await request(app)
    .post(CATEGORIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: `Categoría ${suffix}` });
  const categoryId = categoryRes.body.data.category.id as string;

  const productRes = await request(app)
    .post(PRODUCTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: `Producto ${suffix}`, category: categoryId, basePrice: 20000 });
  const productId = productRes.body.data.product.id as string;

  const variantRes = await request(app)
    .post(VARIANTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ product: productId, print: printId, images: [validImage] });
  const variantId = variantRes.body.data.variant.id as string;

  await Variant.updateOne({ _id: variantId }, { $set: { onHand } });
  return variantId;
};

const newOrderId = (): mongoose.Types.ObjectId => new mongoose.Types.ObjectId();

describe("reservationService · reserveStock", () => {
  it("reserva stock: reserved sube, onHand no se toca, expiresAt ~ now+ttl, purgeAt null", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "R1", 10);
    const orderId = newOrderId();
    const before = Date.now();

    await reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 3 }], 30, CTX);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(10);
    expect(variant?.reserved).toBe(3);

    const reservation = await StockReservation.findOne({ order: orderId }).lean();
    expect(reservation?.status).toBe(ReservationStatus.ACTIVE);
    expect(reservation?.purgeAt).toBeNull();
    const expiresAtMs = new Date(reservation!.expiresAt).getTime();
    expect(expiresAtMs).toBeGreaterThan(before + 29 * 60 * 1000);
    expect(expiresAtMs).toBeLessThan(before + 31 * 60 * 1000);
  });

  it("reserva exactamente el disponible: éxito, available 0", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "R2", 10);
    const orderId = newOrderId();

    await reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 10 }], 30, CTX);

    const variant = await Variant.findById(variantId).lean();
    expect(variant!.onHand - variant!.reserved).toBe(0);
  });

  it("reservar uno más que el disponible responde 409 y no modifica la DB", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "R3", 10);
    const orderId = newOrderId();

    await expect(
      reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 11 }], 30, CTX),
    ).rejects.toMatchObject({ statusCode: 409 });

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
  });

  it("reservar sobre una variante isActive:false responde 409 y no modifica la DB", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "R4", 10);
    await Variant.updateOne({ _id: variantId }, { $set: { isActive: false } });
    const orderId = newOrderId();

    await expect(
      reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 1 }], 30, CTX),
    ).rejects.toMatchObject({ statusCode: 409 });

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
  });

  it("rollback multi-línea: la primera variante queda con reserved 0 si la segunda falla", async () => {
    const cookie = await loginAsAdmin(app);
    const variantA = await seedVariant(cookie, "R5A", 10);
    const variantB = await seedVariant(cookie, "R5B", 2);
    const orderId = newOrderId();

    await expect(
      reserveStock(
        orderId,
        [
          { variant: new mongoose.Types.ObjectId(variantA), qty: 5 },
          { variant: new mongoose.Types.ObjectId(variantB), qty: 5 },
        ],
        30,
        CTX,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    const a = await Variant.findById(variantA).lean();
    const b = await Variant.findById(variantB).lean();
    expect(a?.reserved).toBe(0);
    expect(b?.reserved).toBe(0);
  });

  it("reservar dos veces para el mismo orderId responde 409 (índice único de order)", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "R6", 10);
    const orderId = newOrderId();

    await reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 1 }], 30, CTX);
    await expect(
      reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 1 }], 30, CTX),
    ).rejects.toThrow();
  });

  it("registra auditoría STOCK_RESERVED en éxito; el 409 no escribe ninguna", async () => {
    const cookie = await loginAsAdmin(app);
    const okVariant = await seedVariant(cookie, "R7A", 10);
    const okOrder = newOrderId();
    await reserveStock(okOrder, [{ variant: new mongoose.Types.ObjectId(okVariant), qty: 1 }], 30, CTX);

    const failVariant = await seedVariant(cookie, "R7B", 1);
    const failOrder = newOrderId();
    await expect(
      reserveStock(failOrder, [{ variant: new mongoose.Types.ObjectId(failVariant), qty: 5 }], 30, CTX),
    ).rejects.toMatchObject({ statusCode: 409 });

    const okAudits = await AuditLog.countDocuments({
      action: AuditAction.STOCK_RESERVED,
      targetId: String(okOrder),
    });
    const failAudits = await AuditLog.countDocuments({
      action: AuditAction.STOCK_RESERVED,
      targetId: String(failOrder),
    });
    expect(okAudits).toBe(1);
    expect(failAudits).toBe(0);
  });
});

describe("reservationService · commitReservation", () => {
  it("confirma: reserva committed, purgeAt fijado, onHand y reserved decrementan", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "C1", 10);
    const orderId = newOrderId();
    await reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 4 }], 30, CTX);

    const applied = await commitReservation(orderId);
    expect(applied).toBe(true);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(6);
    expect(variant?.reserved).toBe(0);

    const reservation = await StockReservation.findOne({ order: orderId }).lean();
    expect(reservation?.status).toBe(ReservationStatus.COMMITTED);
    expect(reservation?.purgeAt).not.toBeNull();
  });

  it("es idempotente: confirmar una reserva ya committed no mueve el stock de nuevo", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "C2", 10);
    const orderId = newOrderId();
    await reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 4 }], 30, CTX);
    await commitReservation(orderId);

    const secondApplied = await commitReservation(orderId);
    expect(secondApplied).toBe(false);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(6);
    expect(variant?.reserved).toBe(0);
  });

  it("confirmar una reserva inexistente es un no-op silencioso", async () => {
    const applied = await commitReservation(newOrderId());
    expect(applied).toBe(false);
  });

  it("confirmar una reserva ya released es un no-op (no revive stock devuelto)", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "C3", 10);
    const orderId = newOrderId();
    await reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 4 }], 30, CTX);
    await releaseReservation(orderId, "expired");

    const applied = await commitReservation(orderId);
    expect(applied).toBe(false);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(10);
    expect(variant?.reserved).toBe(0);
  });
});

describe("reservationService · releaseReservation", () => {
  it("libera: reserva released con releasedReason, reserved decrementa, onHand intacto", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "L1", 10);
    const orderId = newOrderId();
    await reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 3 }], 30, CTX);

    const applied = await releaseReservation(orderId, "expired");
    expect(applied).toBe(true);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(10);
    expect(variant?.reserved).toBe(0);

    const reservation = await StockReservation.findOne({ order: orderId }).lean();
    expect(reservation?.status).toBe(ReservationStatus.RELEASED);
    expect(reservation?.releasedReason).toBe("expired");
  });

  it("liberar una reserva ya released es un no-op sin mover stock", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "L2", 10);
    const orderId = newOrderId();
    await reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 3 }], 30, CTX);
    await releaseReservation(orderId, "expired");

    const secondApplied = await releaseReservation(orderId, "expired");
    expect(secondApplied).toBe(false);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
  });
});

describe("reservationService · concurrencia (el invariante que protege contra oversell)", () => {
  it("20 reserveStock paralelos de qty 1 sobre onHand=10: exactamente 10 éxitos, resto 409", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "CC1", 10);
    const variantObjectId = new mongoose.Types.ObjectId(variantId);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        reserveStock(newOrderId(), [{ variant: variantObjectId, qty: 1 }], 30, CTX),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(10);
    expect(rejected).toHaveLength(10);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ statusCode: 409 });
    }

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(10);
    expect(variant!.onHand - variant!.reserved).toBe(0);
    expect(variant?.onHand).toBe(10);
  });

  it("20 commitReservation paralelos de la misma reserva (qty 2): exactamente uno gana", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "CC2", 10);
    const orderId = newOrderId();
    await reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 2 }], 30, CTX);

    await Promise.allSettled(Array.from({ length: 20 }, () => commitReservation(orderId)));

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.onHand).toBe(8);
    expect(variant?.reserved).toBe(0);
  });

  it("20 releaseReservation paralelos de la misma reserva (qty 2): reserved nunca negativo", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "CC3", 10);
    const orderId = newOrderId();
    await reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 2 }], 30, CTX);

    await Promise.allSettled(Array.from({ length: 20 }, () => releaseReservation(orderId, "expired")));

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(0);
    expect(variant?.onHand).toBe(10);
  });

  it("carrera commit vs release sobre la misma reserva: exactamente uno gana, reserved nunca negativo", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "CC4", 10);
    const orderId = newOrderId();
    await reserveStock(orderId, [{ variant: new mongoose.Types.ObjectId(variantId), qty: 2 }], 30, CTX);

    await Promise.allSettled([commitReservation(orderId), releaseReservation(orderId, "expired")]);

    const variant = await Variant.findById(variantId).lean();
    expect(variant!.reserved).toBeGreaterThanOrEqual(0);
    const committedCase = variant?.onHand === 8 && variant?.reserved === 0;
    const releasedCase = variant?.onHand === 10 && variant?.reserved === 0;
    expect(committedCase || releasedCase).toBe(true);
  });

  it("12 reservas paralelas de qty 1 sobre onHand=10,reserved=4: exactamente 6 éxitos", async () => {
    const cookie = await loginAsAdmin(app);
    const variantId = await seedVariant(cookie, "CC5", 10);
    await Variant.updateOne({ _id: variantId }, { $set: { reserved: 4 } });
    const variantObjectId = new mongoose.Types.ObjectId(variantId);

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        reserveStock(newOrderId(), [{ variant: variantObjectId, qty: 1 }], 30, CTX),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(6);

    const variant = await Variant.findById(variantId).lean();
    expect(variant?.reserved).toBe(10);
    expect(variant!.onHand - variant!.reserved).toBe(0);
  });
});
