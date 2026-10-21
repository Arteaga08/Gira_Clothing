import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Print } from "../../src/models/Print.js";
import { PrintFamily } from "../../src/models/PrintFamily.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const app = buildApp();
const BASE = "/api/v1/admin/print-families";

const image = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};

const createFamily = (cookie: string, name = "Florales", description?: string) =>
  request(app)
    .post(BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name, ...(description ? { description } : {}) });

let seq = 0;
const seedPrint = async (familyId: string, name: string, isActive = true) => {
  seq += 1;
  await Print.create({
    name,
    slug: `print-fam-dto-${seq}`,
    sku: `FD-${seq}`,
    family: familyId,
    image,
    isActive,
  });
};

describe("Admin · PrintFamily · DTO de admin", () => {
  it("el listado trae conteos, estampas activas (A-Z) y updatedAt", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = (await createFamily(cookie)).body.data.family.id as string;
    await seedPrint(familyId, "Peonía");
    await seedPrint(familyId, "Azucena");
    await seedPrint(familyId, "Retirada", false);

    const res = await request(app).get(BASE).set("Cookie", cookie);
    const family = res.body.data.families[0];
    expect(family).toMatchObject({ id: familyId, name: "Florales", printCount: 3, activePrintCount: 2 });
    expect(family.activePrints.map((print: { name: string }) => print.name)).toEqual(["Azucena", "Peonía"]);
    expect(family.activePrints[0].id).toEqual(expect.any(String));
    expect(typeof family.updatedAt).toBe("string");
  });

  it("una familia sin estampas trae ceros y lista vacía", async () => {
    const cookie = await loginAsAdmin(app);
    await createFamily(cookie);
    const res = await request(app).get(BASE).set("Cookie", cookie);
    expect(res.body.data.families[0]).toMatchObject({ printCount: 0, activePrintCount: 0, activePrints: [] });
  });

  it("activePrints se corta en 10 y activePrintCount trae el total real", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = (await createFamily(cookie)).body.data.family.id as string;
    for (let index = 0; index < 12; index += 1) await seedPrint(familyId, `Estampa ${String(index).padStart(2, "0")}`);

    const res = await request(app).get(`${BASE}/${familyId}`).set("Cookie", cookie);
    expect(res.body.data.family.activePrintCount).toBe(12);
    expect(res.body.data.family.activePrints).toHaveLength(10);
  });

  it("filtra por estado y busca por nombre", async () => {
    const cookie = await loginAsAdmin(app);
    await createFamily(cookie, "Florales");
    const rayas = (await createFamily(cookie, "Rayas")).body.data.family.id as string;
    await PrintFamily.updateOne({ _id: rayas }, { isActive: false });

    const active = await request(app).get(`${BASE}?isActive=true`).set("Cookie", cookie);
    expect(active.body.data.families.map((family: { name: string }) => family.name)).toEqual(["Florales"]);
    const retired = await request(app).get(`${BASE}?isActive=false`).set("Cookie", cookie);
    expect(retired.body.data.families.map((family: { name: string }) => family.name)).toEqual(["Rayas"]);
    const found = await request(app).get(`${BASE}?search=ray`).set("Cookie", cookie);
    expect(found.body.data.families.map((family: { name: string }) => family.name)).toEqual(["Rayas"]);
  });

  it("ordena por nombre y por -updatedAt, y un campo fuera de la lista blanca cae al orden por nombre", async () => {
    const cookie = await loginAsAdmin(app);
    await createFamily(cookie, "Zeta");
    await createFamily(cookie, "Alfa");
    const byName = await request(app).get(`${BASE}?sort=name`).set("Cookie", cookie);
    expect(byName.body.data.families.map((family: { name: string }) => family.name)).toEqual(["Alfa", "Zeta"]);
    const recent = await request(app).get(`${BASE}?sort=-updatedAt`).set("Cookie", cookie);
    expect(recent.body.data.families.map((family: { name: string }) => family.name)).toEqual(["Alfa", "Zeta"]);
    const unknown = await request(app).get(`${BASE}?sort=slug`).set("Cookie", cookie);
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.families.map((family: { name: string }) => family.name)).toEqual(["Alfa", "Zeta"]);
  });

  it("las mutaciones responden el DTO de admin", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createFamily(cookie, "Florales", "Rosas");
    expect(created.status).toBe(201);
    expect(created.body.data.family).toMatchObject({ printCount: 0, activePrintCount: 0, activePrints: [], description: "Rosas" });
    const id = created.body.data.family.id as string;
    await seedPrint(id, "Peonía");

    const updated = await request(app)
      .patch(`${BASE}/${id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Florales 2" });
    expect(updated.body.data.family).toMatchObject({ name: "Florales 2", printCount: 1, activePrintCount: 1 });

    const blocked = await request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie);
    expect(blocked.status).toBe(409);
  });

  it("retira sin estampas activas y reactiva sin validar nada", async () => {
    const cookie = await loginAsAdmin(app);
    const id = (await createFamily(cookie)).body.data.family.id as string;
    const retired = await request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie);
    expect(retired.status).toBe(200);
    expect(retired.body.data.family).toMatchObject({ isActive: false, printCount: 0 });
    const back = await request(app)
      .patch(`${BASE}/${id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ isActive: true });
    expect(back.body.data.family.isActive).toBe(true);
  });

  it("un id inexistente responde 404", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${BASE}/64b7f0f0f0f0f0f0f0f0f0f0`).set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("ordena los nombres con acentos y sin distinguir mayúsculas", async () => {
    const cookie = await loginAsAdmin(app);
    await createFamily(cookie, "Zeta");
    await createFamily(cookie, "árboles");
    await createFamily(cookie, "Beta");
    const res = await request(app).get(`${BASE}?sort=name`).set("Cookie", cookie);
    expect(res.body.data.families.map((item: { name: string }) => item.name)).toEqual(["árboles", "Beta", "Zeta"]);
  });
});
