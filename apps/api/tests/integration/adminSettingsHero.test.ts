import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { Types } from "mongoose";
import { AuditAction } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { Product } from "../../src/models/Product.js";
import { seedVariant } from "../helpers/seedInventory.js";
import { ORIGIN, loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";

const app: Express = buildApp();

const image = (n: number) => ({
  url: `https://res.cloudinary.com/gira/image/upload/v1/home/hero-${n}.jpg`,
  publicId: `gira/home/hero-${n}`,
  width: 1600,
  height: 1000,
});

const slide = (n: number, productId: string | null = null, extra: Record<string, unknown> = {}) => ({
  headline: `Foto ${n}`,
  image: image(n),
  productId,
  titleColor: "bone",
  buttonColor: "yellow",
  cards: [],
  ...extra,
});

describe("Admin · Settings · hero de la tienda", () => {
  let adminCookie: string;

  const patchHero = (body: Record<string, unknown>) =>
    request(app).patch("/api/v1/admin/settings/hero").set("Cookie", adminCookie).set("Origin", ORIGIN).send(body);
  const readHero = async () =>
    (await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie)).body.data.settings.storefront.hero;

  beforeEach(async () => {
    adminCookie = await loginAsAdmin(app);
  });

  it("el singleton nace sin fotos", async () => {
    expect(await readHero()).toEqual({ slides: [] });
  });

  it("anónimo responde 401 y cliente 403", async () => {
    const anon = await request(app).patch("/api/v1/admin/settings/hero").set("Origin", ORIGIN).send({});
    expect(anon.status).toBe(401);
    const customerCookie = await loginAsCustomer(app);
    const res = await request(app)
      .patch("/api/v1/admin/settings/hero")
      .set("Cookie", customerCookie)
      .set("Origin", ORIGIN)
      .send({ slides: [] });
    expect(res.status).toBe(403);
  });

  it("guarda fotos con su titular, producto y cards; ignora campos extra y no toca otras secciones", async () => {
    const { productId } = await seedVariant({ tag: "hero1" });
    const before = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
    const res = await patchHero({
      extra: "x",
      slides: [
        slide(1, productId, {
          headline: "  Estampa que gira  ",
          titleColor: "pink",
          buttonColor: "mint",
          cards: [
            { text: "Estampas únicas", color: "lilac" },
            { text: "Para llevar", color: "mint" },
          ],
        }),
        slide(2),
      ],
    });
    expect(res.status).toBe(200);
    const hero = res.body.data.settings.storefront.hero;
    expect(hero.slides).toHaveLength(2);
    expect(hero.slides[0]).toMatchObject({ headline: "Estampa que gira", productId, titleColor: "pink", buttonColor: "mint" });
    expect(hero.slides[0].cards).toEqual([
      { text: "Estampas únicas", color: "lilac" },
      { text: "Para llevar", color: "mint" },
    ]);
    expect(hero.slides[1]).toMatchObject({ headline: "Foto 2", productId: null });
    expect(res.body.data.settings.tax).toEqual(before.body.data.settings.tax);
    expect(res.body.data.settings.storefront.announcement).toEqual(before.body.data.settings.storefront.announcement);
  });

  it("permite vaciar el hero (sin fotos) y dejar el titular de una foto vacío", async () => {
    expect((await patchHero({ slides: [] })).status).toBe(200);
    expect((await patchHero({ slides: [slide(1, null, { headline: "" })] })).status).toBe(200);
  });

  it.each([
    ["titular de 4 palabras", { slides: [slide(1, null, { headline: "uno dos tres cuatro" })] }],
    ["titular de 41 caracteres", { slides: [slide(1, null, { headline: "x".repeat(41) })] }],
    ["foto sin titular", { slides: [{ image: image(1), productId: null, titleColor: "bone", buttonColor: "yellow", cards: [] }] }],
    ["titular global (formato anterior) sin fotos con titular", { headline: "Hola", slides: [{ image: image(1), productId: null, titleColor: "bone", buttonColor: "yellow", cards: [] }] }],
    ["6 fotos", { slides: [1, 2, 3, 4, 5, 6].map((n) => slide(n)) }],
    ["3 cards en una foto", { slides: [slide(1, null, { cards: [1, 2, 3].map((n) => ({ text: `c${n}`, color: "bone" })) })] }],
    ["card de 31 caracteres", { slides: [slide(1, null, { cards: [{ text: "x".repeat(31), color: "bone" }] })] }],
    ["card en blanco", { slides: [slide(1, null, { cards: [{ text: "   ", color: "bone" }] })] }],
    ["color de card inválido", { slides: [slide(1, null, { cards: [{ text: "a", color: "yellow" }] })] }],
    ["botón hueso (un botón nunca es blanco)", { slides: [slide(1, null, { buttonColor: "bone" })] }],
    ["titular en amarillo (exclusivo del botón)", { slides: [slide(1, null, { titleColor: "yellow" })] }],
    ["imagen http", { slides: [slide(1, null, { image: { ...image(1), url: "http://x.test/a.jpg" } })] }],
    ["productId mal formado", { slides: [slide(1, "no-es-un-id")] }],
    ["foto sin productId", { slides: [{ image: image(1), titleColor: "bone", buttonColor: "yellow", cards: [] }] }],
  ])("rechaza %s con 400 y no cambia nada", async (_name, body) => {
    const res = await patchHero(body);
    expect(res.status).toBe(400);
    expect(await readHero()).toEqual({ slides: [] });
  });

  it("rechaza un producto inexistente o retirado con 400", async () => {
    const missing = await patchHero({ slides: [slide(1, new Types.ObjectId().toString())] });
    expect(missing.status).toBe(400);

    const { productId } = await seedVariant({ tag: "hero-retired" });
    await Product.findByIdAndUpdate(productId, { isActive: false });
    const retired = await patchHero({ slides: [slide(1, productId)] });
    expect(retired.status).toBe(400);
    expect(await readHero()).toEqual({ slides: [] });
  });

  it("audita el cambio con el estado de antes y el de después", async () => {
    await patchHero({ slides: [slide(1, null, { headline: "Hola" })] });
    const entry = await AuditLog.findOne({ action: AuditAction.SETTINGS_HERO_UPDATED }).lean();
    expect(entry?.module).toBe("settings");
    expect(entry?.before).toEqual({ slides: [] });
    expect((entry?.after as { slides: { headline: string }[] }).slides[0]?.headline).toBe("Hola");
  });

  describe("GET /storefront/hero (público)", () => {
    it("sin sesión y sin configurar devuelve cero fotos", async () => {
      const res = await request(app).get("/api/v1/storefront/hero");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ hero: { slides: [] } });
    });

    it("expone slug y nombre del producto, nunca ids ni publicId", async () => {
      const { productId } = await seedVariant({ tag: "hero-public", productName: "Playera Flor" });
      await patchHero({
        slides: [slide(1, productId, { headline: "Estampa que gira", cards: [{ text: "Únicas", color: "pink" }] }), slide(2)],
      });
      const res = await request(app).get("/api/v1/storefront/hero");
      const { hero } = res.body.data;
      expect(hero.slides[0].headline).toBe("Estampa que gira");
      expect(hero.slides[0].product).toEqual({ slug: "modelo-hero-public", name: "Playera Flor" });
      expect(hero.slides[0].image).toEqual({ url: image(1).url, width: 1600, height: 1000 });
      expect(hero.slides[1].product).toBeNull();
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain(productId);
      expect(raw).not.toContain("publicId");
    });

    it("un producto retirado después de guardar deja la foto sin enlace en vez de un 404", async () => {
      const { productId } = await seedVariant({ tag: "hero-later" });
      await patchHero({ slides: [slide(1, productId)] });
      await Product.findByIdAndUpdate(productId, { isActive: false });
      const res = await request(app).get("/api/v1/storefront/hero");
      expect(res.body.data.hero.slides[0].product).toBeNull();
    });
  });
});
