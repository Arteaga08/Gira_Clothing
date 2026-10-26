import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { AuditAction } from "@gira/shared";
import { Types } from "mongoose";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { Product } from "../../src/models/Product.js";
import { seedVariant } from "../helpers/seedInventory.js";
import { ORIGIN, loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";

const app: Express = buildApp();

const image = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/home/offer.jpg",
  publicId: "gira/home/offer",
  width: 2400,
  height: 900,
};

const EMPTY = { enabled: false, image: null, alt: "", message: "", buttonLabel: "", productId: null };

const banner = (extra: Record<string, unknown> = {}) => ({
  enabled: true,
  image,
  alt: "Modelo con playeras de Gira",
  message: "Rebajas de temporada en toda la tienda",
  buttonLabel: "Comprar ahora",
  productId: null,
  ...extra,
});

describe("Admin · Settings · banner de ofertas", () => {
  let adminCookie: string;

  const patchBanner = (body: Record<string, unknown>) =>
    request(app)
      .patch("/api/v1/admin/settings/offer-banner")
      .set("Cookie", adminCookie)
      .set("Origin", ORIGIN)
      .send(body);
  const readBanner = async () =>
    (await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie)).body.data.settings.storefront
      .offerBanner;

  beforeEach(async () => {
    adminCookie = await loginAsAdmin(app);
  });

  it("el singleton nace con el banner oculto y vacío", async () => {
    expect(await readBanner()).toEqual(EMPTY);
  });

  it("anónimo responde 401 y cliente 403", async () => {
    const anon = await request(app).patch("/api/v1/admin/settings/offer-banner").set("Origin", ORIGIN).send(banner());
    expect(anon.status).toBe(401);
    const customerCookie = await loginAsCustomer(app);
    const res = await request(app)
      .patch("/api/v1/admin/settings/offer-banner")
      .set("Cookie", customerCookie)
      .set("Origin", ORIGIN)
      .send(banner());
    expect(res.status).toBe(403);
  });

  it("guarda el banner recortando espacios, ignora campos extra y no toca otras secciones", async () => {
    const before = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
    const res = await patchBanner(banner({ extra: "x", href: "/tienda", message: "  Rebajas  " }));
    expect(res.status).toBe(200);
    expect(res.body.data.settings.storefront.offerBanner).toEqual(banner({ message: "Rebajas" }));
    expect(res.body.data.settings.storefront.hero).toEqual(before.body.data.settings.storefront.hero);
    expect(res.body.data.settings.storefront.announcement).toEqual(before.body.data.settings.storefront.announcement);
  });

  it("oculto puede quedar a medio llenar", async () => {
    const res = await patchBanner({ ...EMPTY, message: "Borrador" });
    expect(res.status).toBe(200);
    expect(await readBanner()).toEqual({ ...EMPTY, message: "Borrador" });
  });

  it.each([
    ["visible sin foto", banner({ image: null })],
    ["visible sin descripción", banner({ alt: "" })],
    ["visible sin frase", banner({ message: "   " })],
    ["visible sin texto de botón", banner({ buttonLabel: "" })],
    ["productId mal formado", banner({ productId: "no-es-un-id" })],
    ["sin productId", (({ productId: _omit, ...rest }) => rest)(banner())],
    ["frase de 81 caracteres", banner({ message: "x".repeat(81) })],
    ["botón de 21 caracteres", banner({ buttonLabel: "x".repeat(21) })],
    ["imagen http", banner({ image: { ...image, url: "http://x.test/a.jpg" } })],
    ["enabled como texto", banner({ enabled: "true" })],
    ["sin campos", {}],
  ])("rechaza %s con 400 y no cambia nada", async (_name, body) => {
    const res = await patchBanner(body);
    expect(res.status).toBe(400);
    expect(await readBanner()).toEqual(EMPTY);
  });

  it("guarda el producto al que lleva; rechaza uno inexistente o retirado", async () => {
    const { productId } = await seedVariant({ tag: "offer-product" });
    const ok = await patchBanner(banner({ productId }));
    expect(ok.status).toBe(200);
    expect((await readBanner()).productId).toBe(productId);

    expect((await patchBanner(banner({ productId: new Types.ObjectId().toString() }))).status).toBe(400);
    await Product.findByIdAndUpdate(productId, { isActive: false });
    expect((await patchBanner(banner({ productId, message: "Otra" }))).status).toBe(400);
    expect((await readBanner()).message).toBe("Rebajas de temporada en toda la tienda");
  });

  it("audita el cambio con el estado de antes y el de después", async () => {
    await patchBanner(banner());
    const entry = await AuditLog.findOne({ action: AuditAction.SETTINGS_OFFER_BANNER_UPDATED }).lean();
    expect(entry?.module).toBe("settings");
    expect(entry?.before).toEqual(EMPTY);
    expect(entry?.after).toEqual(banner());
  });

  describe("GET /storefront/offer-banner (público)", () => {
    it("sin sesión y sin configurar devuelve null", async () => {
      const res = await request(app).get("/api/v1/storefront/offer-banner");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ banner: null });
    });

    it("oculto devuelve null aunque esté lleno", async () => {
      await patchBanner(banner({ enabled: false }));
      const res = await request(app).get("/api/v1/storefront/offer-banner");
      expect(res.body.data).toEqual({ banner: null });
    });

    it("visible sin producto expone foto y textos con product null, nunca publicId", async () => {
      await patchBanner(banner());
      const res = await request(app).get("/api/v1/storefront/offer-banner");
      expect(res.body.data.banner).toEqual({
        image: { url: image.url, width: 2400, height: 900 },
        alt: "Modelo con playeras de Gira",
        message: "Rebajas de temporada en toda la tienda",
        buttonLabel: "Comprar ahora",
        product: null,
      });
      expect(JSON.stringify(res.body)).not.toContain("publicId");
    });

    it("con producto expone slug y nombre, nunca su id; retirado después cae a null", async () => {
      const { productId } = await seedVariant({ tag: "offer-public", productName: "Playera Flor" });
      await patchBanner(banner({ productId }));
      const res = await request(app).get("/api/v1/storefront/offer-banner");
      expect(res.body.data.banner).toMatchObject({
        product: { slug: "modelo-offer-public", name: "Playera Flor" },
      });
      expect(JSON.stringify(res.body)).not.toContain(productId);

      await Product.findByIdAndUpdate(productId, { isActive: false });
      const later = await request(app).get("/api/v1/storefront/offer-banner");
      expect(later.body.data.banner).toMatchObject({ product: null });
    });
  });
});
