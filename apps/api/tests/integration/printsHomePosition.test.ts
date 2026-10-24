import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const FAMILIES_BASE = "/api/v1/admin/print-families";
const PRINTS_BASE = "/api/v1/admin/prints";
const CATALOG_PRINTS = "/api/v1/catalog/prints";

const validImage = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};

const createFamily = async (cookie: string, name = "Florales") => {
  const res = await request(app).post(FAMILIES_BASE).set("Origin", ORIGIN).set("Cookie", cookie).send({ name });
  return res.body.data.family.id as string;
};

const createPrint = (cookie: string, familyId: string, name: string, sku: string, extra: Record<string, unknown> = {}) =>
  request(app)
    .post(PRINTS_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name, sku, family: familyId, image: validImage, ...extra });

const patchPrint = (cookie: string, id: string, body: Record<string, unknown>) =>
  request(app).patch(`${PRINTS_BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie).send(body);

describe("Admin · Print · posición en la home", () => {
  it("guarda la posición al crear y al editar, y la quita con null", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);

    const created = await createPrint(cookie, familyId, "Rosas", "FLR-001", { homePosition: 2 });
    expect(created.status).toBe(201);
    expect(created.body.data.print.homePosition).toBe(2);

    const id = created.body.data.print.id as string;
    const moved = await patchPrint(cookie, id, { homePosition: 5 });
    expect(moved.status).toBe(200);
    expect(moved.body.data.print.homePosition).toBe(5);

    const cleared = await patchPrint(cookie, id, { homePosition: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.print.homePosition).toBeUndefined();
  });

  it("rechaza posiciones fuera de 1 a 6", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const created = await createPrint(cookie, familyId, "Rosas", "FLR-001");
    const id = created.body.data.print.id as string;

    expect((await patchPrint(cookie, id, { homePosition: 0 })).status).toBe(400);
    expect((await patchPrint(cookie, id, { homePosition: 7 })).status).toBe(400);
    expect((await patchPrint(cookie, id, { homePosition: 1.5 })).status).toBe(400);
  });

  it("una posición ocupada responde 409 y nombra la estampa que la tiene", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    await createPrint(cookie, familyId, "Rosas", "FLR-001", { homePosition: 1 });
    const other = await createPrint(cookie, familyId, "Lirios", "FLR-002");

    const res = await patchPrint(cookie, other.body.data.print.id as string, { homePosition: 1 });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("Rosas");

    const onCreate = await createPrint(cookie, familyId, "Dalias", "FLR-003", { homePosition: 1 });
    expect(onCreate.status).toBe(409);
  });

  it("volver a guardar la misma posición en la misma estampa no choca consigo misma", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const created = await createPrint(cookie, familyId, "Rosas", "FLR-001", { homePosition: 3 });
    const res = await patchPrint(cookie, created.body.data.print.id as string, { homePosition: 3, name: "Rosas rojas" });
    expect(res.status).toBe(200);
    expect(res.body.data.print.homePosition).toBe(3);
  });

  it("retirar una estampa libera su posición", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const created = await createPrint(cookie, familyId, "Rosas", "FLR-001", { homePosition: 4 });
    const id = created.body.data.print.id as string;

    const retired = await patchPrint(cookie, id, { isActive: false });
    expect(retired.status).toBe(200);
    expect(retired.body.data.print.homePosition).toBeUndefined();

    const reuse = await createPrint(cookie, familyId, "Lirios", "FLR-002", { homePosition: 4 });
    expect(reuse.status).toBe(201);
  });
});

describe("Admin · Print · retiro por DELETE", () => {
  it("libera la posición de la home", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const created = await createPrint(cookie, familyId, "Rosas", "FLR-001", { homePosition: 6 });

    const res = await request(app)
      .delete(`${PRINTS_BASE}/${created.body.data.print.id as string}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.print.homePosition).toBeUndefined();
  });
});

describe("Catálogo público · estampas destacadas", () => {
  it("?featured=true devuelve solo las estampas activas con posición, en orden de posición", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    await createPrint(cookie, familyId, "Amapolas", "FLR-001", { homePosition: 3 });
    await createPrint(cookie, familyId, "Zinnias", "FLR-002", { homePosition: 1 });
    await createPrint(cookie, familyId, "Begonias", "FLR-003");
    const retired = await createPrint(cookie, familyId, "Dalias", "FLR-004", { homePosition: 2 });
    await patchPrint(cookie, retired.body.data.print.id as string, { isActive: false });

    const res = await request(app).get(`${CATALOG_PRINTS}?featured=true`);
    expect(res.status).toBe(200);
    expect(res.body.data.prints.map((print: { name: string }) => print.name)).toEqual(["Zinnias", "Amapolas"]);
  });

  it("sin ?featured la lista sigue completa y en orden alfabético", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    await createPrint(cookie, familyId, "Zinnias", "FLR-001", { homePosition: 1 });
    await createPrint(cookie, familyId, "Amapolas", "FLR-002");

    const res = await request(app).get(CATALOG_PRINTS);
    expect(res.body.data.prints.map((print: { name: string }) => print.name)).toEqual(["Amapolas", "Zinnias"]);
  });
});
