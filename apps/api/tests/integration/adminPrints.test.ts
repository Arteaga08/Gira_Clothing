import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const FAMILIES_BASE = "/api/v1/admin/print-families";
const BASE = "/api/v1/admin/prints";

const createFamily = async (cookie: string, name = "Florales") => {
  const res = await request(app)
    .post(FAMILIES_BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name });
  return res.body.data.family.id as string;
};

const validImage = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};

const createPrint = async (
  cookie: string,
  familyId: string,
  overrides: Record<string, unknown> = {},
) =>
  request(app)
    .post(BASE)
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name: "Rosas", sku: "FLR-001", family: familyId, image: validImage, ...overrides });

describe("Admin · Print · autorización", () => {
  it("GET anónimo responde 401", async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });

  it("POST como cliente responde 403", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const clientCookie = await loginAsCustomer(app);
    const res = await createPrint(clientCookie, familyId);
    expect(res.status).toBe(403);
  });
});

describe("Admin · Print · creación", () => {
  it("crea con slug derivado y family poblada", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const res = await createPrint(cookie, familyId, { name: "Rosas Vintage" });
    expect(res.status).toBe(201);
    expect(res.body.data.print.slug).toBe("rosas-vintage");
    expect(res.body.data.print.family).toMatchObject({ id: familyId });
  });

  it("family inexistente responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await createPrint(cookie, "64b7f3f3f3f3f3f3f3f3f3f3");
    expect(res.status).toBe(400);
  });

  it("sin image responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Rosas", sku: "FLR-002", family: familyId });
    expect(res.status).toBe(400);
  });

  it("image malformada (sin publicId) responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const res = await createPrint(cookie, familyId, {
      image: { url: "https://res.cloudinary.com/x.jpg", width: 1, height: 1 },
    });
    expect(res.status).toBe(400);
  });

  it("sku duplicado responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    await createPrint(cookie, familyId, { name: "Rosas A" });
    const second = await createPrint(cookie, familyId, { name: "Rosas B" });
    expect(second.status).toBe(409);
  });

  it("registra auditoría PRINT_CREATED", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    await createPrint(cookie, familyId);
    const entries = await AuditLog.find({ action: "print_created" }).lean();
    expect(entries).toHaveLength(1);
  });
});

describe("Admin · Print · listado", () => {
  it("filtra por ?family=", async () => {
    const cookie = await loginAsAdmin(app);
    const familyA = await createFamily(cookie, "Familia A");
    const familyB = await createFamily(cookie, "Familia B");
    await createPrint(cookie, familyA, { name: "Print A", sku: "SKU-A" });
    await createPrint(cookie, familyB, { name: "Print B", sku: "SKU-B" });

    const res = await request(app).get(`${BASE}?family=${familyA}`).set("Cookie", cookie);
    expect(res.body.data.prints).toHaveLength(1);
    expect(res.body.data.prints[0].name).toBe("Print A");
  });

  it("pagina correctamente", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    for (let i = 0; i < 12; i += 1) {
      await createPrint(cookie, familyId, { name: `Print ${i}`, sku: `SKU-${i}` });
    }
    const res = await request(app).get(`${BASE}?limit=5&page=2`).set("Cookie", cookie);
    expect(res.body.data.prints).toHaveLength(5);
    expect(res.body.meta).toMatchObject({ total: 12, page: 2, limit: 5, pages: 3 });
  });
});

describe("Admin · Print · detalle y actualización", () => {
  it("detalle responde 200", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const created = await createPrint(cookie, familyId);
    const res = await request(app).get(`${BASE}/${created.body.data.print.id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  it("PATCH renombra y re-sluga", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const created = await createPrint(cookie, familyId, { name: "Original" });
    const res = await request(app)
      .patch(`${BASE}/${created.body.data.print.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Renombrado" });
    expect(res.status).toBe(200);
    expect(res.body.data.print.slug).toBe("renombrado");
  });
});

describe("Admin · Print · baja lógica", () => {
  it("DELETE sin variantes responde 200", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie);
    const created = await createPrint(cookie, familyId);
    const res = await request(app)
      .delete(`${BASE}/${created.body.data.print.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.print.isActive).toBe(false);
  });

  // See tests/integration/adminVariants.test.ts for the guard-against-active-
  // Variant case (activated in Tarea 10, once the Variant model exists).
});

describe("Admin · PrintFamily · guard de baja con Print activo (activado en Tarea 8)", () => {
  it("DELETE de la familia con un Print activo responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie, "Con hijos");
    await createPrint(cookie, familyId);
    const res = await request(app)
      .delete(`${FAMILIES_BASE}/${familyId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(409);
  });

  it("PATCH { isActive: false } de la familia corre el mismo guard y responde 409", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie, "Con hijos 2");
    await createPrint(cookie, familyId);
    const res = await request(app)
      .patch(`${FAMILIES_BASE}/${familyId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ isActive: false });
    expect(res.status).toBe(409);
  });

  it("DELETE de la familia con el Print ya inactivo responde 200", async () => {
    const cookie = await loginAsAdmin(app);
    const familyId = await createFamily(cookie, "Hijo inactivo");
    const created = await createPrint(cookie, familyId);
    await request(app)
      .delete(`${BASE}/${created.body.data.print.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    const res = await request(app)
      .delete(`${FAMILIES_BASE}/${familyId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});
