import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { AuditAction } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { ORIGIN, loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";

const app: Express = buildApp();

const image = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/events/bazar.jpg",
  publicId: "gira/events/bazar",
  width: 1200,
  height: 1500,
};

const EMPTY_MESSAGE = "Pronto anunciamos la siguiente parada";

// Far enough away that "today" never catches up with them.
const event = (extra: Record<string, unknown> = {}) => ({
  title: "Bazar Callejero",
  date: "2099-11-14",
  startTime: "11:00",
  endTime: "19:00",
  city: "Monterrey",
  venue: "Parque Fundidora",
  mapsUrl: "https://maps.google.com/?q=fundidora",
  image,
  alt: "Puesto de Gira en el bazar",
  ...extra,
});

const body = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  items,
  emptyMessage: EMPTY_MESSAGE,
  emptyLinkUrl: "https://instagram.com/gira",
  ...extra,
});

describe("Admin · Settings · eventos", () => {
  let adminCookie: string;

  const patchEvents = (payload: Record<string, unknown>) =>
    request(app)
      .patch("/api/v1/admin/settings/events")
      .set("Cookie", adminCookie)
      .set("Origin", ORIGIN)
      .send(payload);
  const readEvents = async () =>
    (await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie)).body.data.settings.storefront
      .events;

  beforeEach(async () => {
    adminCookie = await loginAsAdmin(app);
  });

  it("el singleton nace sin eventos", async () => {
    expect(await readEvents()).toEqual({ items: [], emptyMessage: "", emptyLinkUrl: "" });
  });

  it("anónimo responde 401 y cliente 403", async () => {
    const anon = await request(app).patch("/api/v1/admin/settings/events").set("Origin", ORIGIN).send(body([]));
    expect(anon.status).toBe(401);
    const customerCookie = await loginAsCustomer(app);
    const res = await request(app)
      .patch("/api/v1/admin/settings/events")
      .set("Cookie", customerCookie)
      .set("Origin", ORIGIN)
      .send(body([]));
    expect(res.status).toBe(403);
  });

  it("guarda los eventos recortando espacios, ignora campos extra y no toca otras secciones", async () => {
    const before = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
    const res = await patchEvents(body([event({ title: "  Bazar Callejero  ", extra: "x" })]));
    expect(res.status).toBe(200);
    const saved = res.body.data.settings.storefront.events;
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject(event());
    expect(saved.items[0].id).toEqual(expect.any(String));
    expect(res.body.data.settings.storefront.hero).toEqual(before.body.data.settings.storefront.hero);
    expect(res.body.data.settings.storefront.offerBanner).toEqual(before.body.data.settings.storefront.offerBanner);
  });

  it("sin foto, hora de cierre ni mapa es válido", async () => {
    const res = await patchEvents(body([event({ image: null, alt: "", endTime: "", mapsUrl: "" })]));
    expect(res.status).toBe(200);
  });

  it.each([
    ["enlace del mapa sin https", { mapsUrl: "http://maps.google.com" }],
    ["enlace del mapa javascript:", { mapsUrl: "javascript:alert(1)" }],
    ["foto sin descripción", { alt: "" }],
    ["fecha inexistente", { date: "2099-13-45" }],
    ["fecha en otro formato", { date: "14/11/2099" }],
    ["hora inválida", { startTime: "25:00" }],
    ["nombre vacío", { title: "  " }],
    ["ciudad ausente", { city: undefined }],
  ])("rechaza %s con 400", async (_label, extra) => {
    const res = await patchEvents(body([event(extra)]));
    expect(res.status).toBe(400);
  });

  it("rechaza más de 8 eventos", async () => {
    const res = await patchEvents(body(Array.from({ length: 9 }, () => event())));
    expect(res.status).toBe(400);
  });

  it("exige el mensaje de cuando no hay eventos y rechaza un enlace que no es https", async () => {
    expect((await patchEvents(body([], { emptyMessage: "  " }))).status).toBe(400);
    expect((await patchEvents(body([], { emptyLinkUrl: "ftp://x.com" }))).status).toBe(400);
  });

  it("audita el cambio con el estado de antes y el de después", async () => {
    await patchEvents(body([event()]));
    const entry = await AuditLog.findOne({ action: AuditAction.SETTINGS_EVENTS_UPDATED }).lean();
    expect(entry).toBeTruthy();
    expect((entry?.before as { items: unknown[] }).items).toHaveLength(0);
    expect((entry?.after as { items: unknown[] }).items).toHaveLength(1);
  });

  describe("GET /storefront/events (público)", () => {
    it("sin eventos responde next null y el mensaje editable", async () => {
      await patchEvents(body([]));
      const res = await request(app).get("/api/v1/storefront/events");
      expect(res.status).toBe(200);
      expect(res.body.data.events).toEqual({
        next: null,
        later: [],
        emptyMessage: EMPTY_MESSAGE,
        emptyLinkUrl: "https://instagram.com/gira",
      });
    });

    it("oculta los pasados, ordena por día y hora, y reparte próximo y después", async () => {
      await patchEvents(
        body([
          event({ title: "Tercero", date: "2099-12-20" }),
          event({ title: "Pasado", date: "2020-01-01" }),
          event({ title: "Segundo", date: "2099-11-14", startTime: "16:00" }),
          event({ title: "Primero", date: "2099-11-14", startTime: "10:00" }),
        ]),
      );
      const { events } = (await request(app).get("/api/v1/storefront/events")).body.data;
      expect(events.next.title).toBe("Primero");
      expect(events.later.map((e: { title: string }) => e.title)).toEqual(["Segundo", "Tercero"]);
    });

    it("limita «Después» a 4 y nunca expone publicId ni ids", async () => {
      await patchEvents(
        body(
          Array.from({ length: 7 }, (_unused, i) => event({ title: `Evento ${i}`, date: `2099-11-${10 + i}` })),
        ),
      );
      const res = await request(app).get("/api/v1/storefront/events");
      expect(res.body.data.events.later).toHaveLength(4);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain("publicId");
      expect(text).not.toContain('"id"');
      expect(text).not.toContain("_id");
      expect(res.body.data.events.next.image).toEqual({ url: image.url, width: 1200, height: 1500 });
    });
  });
});
