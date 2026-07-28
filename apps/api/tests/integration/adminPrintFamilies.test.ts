import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const BASE = "/api/v1/admin/print-families";

const createFamily = async (cookie: string, overrides: Record<string, unknown> = {}) =>
  request(app)
    .post(BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: "Florales", ...overrides });

describe("Admin · PrintFamily · autorización", () => {
  it("GET anónimo responde 401", async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it("POST anónimo responde 401", async () => {
    const res = await request(app).post(BASE).set("Origin", ORIGIN).send({ name: "Florales" });
    expect(res.status).toBe(401);
  });

  it("POST como cliente responde 403", async () => {
    const cookie = await loginAsCustomer(app);
    const res = await createFamily(cookie);
    expect(res.status).toBe(403);
  });
});

describe("Admin · PrintFamily · creación", () => {
  it("crea con slug derivado del nombre", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await createFamily(cookie, { name: "Florales Vintage" });
    expect(res.status).toBe(201);
    expect(res.body.data.family.slug).toBe("florales-vintage");
    expect(res.body.data.family.isActive).toBe(true);
  });

  it("elimina acentos al derivar el slug", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await createFamily(cookie, { name: "Bárbara" });
    expect(res.body.data.family.slug).toBe("barbara");
  });

  it("desambigua el slug cuando el nombre se repite", async () => {
    const cookie = await loginAsAdmin(app);
    await createFamily(cookie, { name: "Rayas" });
    const second = await createFamily(cookie, { name: "Rayas" });
    expect(second.body.data.family.slug).toBe("rayas-2");
  });

  it("sin name responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it("name de más de 80 caracteres responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await createFamily(cookie, { name: "a".repeat(81) });
    expect(res.status).toBe(400);
  });

  it("descarta campos desconocidos (stripUnknown)", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await createFamily(cookie, { isActive: false });
    expect(res.status).toBe(201);
    expect(res.body.data.family.isActive).toBe(true);
  });

  it("registra auditoría PRINT_FAMILY_CREATED", async () => {
    const cookie = await loginAsAdmin(app);
    await createFamily(cookie, { name: "Lunares" });
    const entries = await AuditLog.find({ action: "print_family_created" }).lean();
    expect(entries).toHaveLength(1);
  });
});

describe("Admin · PrintFamily · listado", () => {
  it("pagina correctamente", async () => {
    const cookie = await loginAsAdmin(app);
    for (let i = 0; i < 25; i += 1) {
      await createFamily(cookie, { name: `Familia ${i}` });
    }
    const res = await request(app)
      .get(`${BASE}?limit=10&page=3`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.families).toHaveLength(5);
    expect(res.body.meta).toMatchObject({ total: 25, page: 3, limit: 10, pages: 3 });
  });

  it("filtra con ?search=", async () => {
    const cookie = await loginAsAdmin(app);
    await createFamily(cookie, { name: "Cuadros Escoceses" });
    await createFamily(cookie, { name: "Lunares" });
    const res = await request(app).get(`${BASE}?search=escoceses`).set("Cookie", cookie);
    expect(res.body.data.families).toHaveLength(1);
    expect(res.body.data.families[0].name).toBe("Cuadros Escoceses");
  });

  it("filtra con ?isActive=false", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createFamily(cookie, { name: "Retirada" });
    await request(app)
      .delete(`${BASE}/${created.body.data.family.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    const res = await request(app).get(`${BASE}?isActive=false`).set("Cookie", cookie);
    expect(res.body.data.families).toHaveLength(1);
  });

  it("?limit=1000 responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${BASE}?limit=1000`).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });
});

describe("Admin · PrintFamily · detalle", () => {
  it("responde 200 con la familia", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createFamily(cookie, { name: "Detalle" });
    const res = await request(app)
      .get(`${BASE}/${created.body.data.family.id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.family.name).toBe("Detalle");
  });

  it("id inexistente responde 404", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .get(`${BASE}/64b7f3f3f3f3f3f3f3f3f3f3`)
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("id malformado responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${BASE}/no-es-un-id`).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });
});

describe("Admin · PrintFamily · actualización", () => {
  it("PATCH renombra y re-sluga", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createFamily(cookie, { name: "Original" });
    const res = await request(app)
      .patch(`${BASE}/${created.body.data.family.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Renombrada" });
    expect(res.status).toBe(200);
    expect(res.body.data.family.slug).toBe("renombrada");
  });

  it("renombrar sin cambiar el nombre no colisiona consigo mismo", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createFamily(cookie, { name: "Estable" });
    const res = await request(app)
      .patch(`${BASE}/${created.body.data.family.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ description: "actualizada" });
    expect(res.status).toBe(200);
    expect(res.body.data.family.slug).toBe("estable");
  });
});

describe("Admin · PrintFamily · baja lógica", () => {
  it("DELETE sin hijos responde 200 y marca isActive:false", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createFamily(cookie, { name: "Sin hijos" });
    const res = await request(app)
      .delete(`${BASE}/${created.body.data.family.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.family.isActive).toBe(false);
  });

  // See tests/integration/adminPrints.test.ts for the guard-against-active-Print
  // cases (activated in Tarea 8, once the Print model exists).

  it("DELETE con hijos solo inactivos responde 200", async () => {
    const cookie = await loginAsAdmin(app);
    const created = await createFamily(cookie, { name: "Sin hijos activos" });
    const res = await request(app)
      .delete(`${BASE}/${created.body.data.family.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});
