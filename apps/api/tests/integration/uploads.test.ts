import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";

const app = buildApp();

const BASE = "/api/v1/admin/uploads";

// Minimal real PNG magic bytes so assertImageSignature accepts it.
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe("Admin · Uploads · autorización", () => {
  it("anónimo responde 401", async () => {
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .field("folder", "prints")
      .attach("file", PNG_BYTES, { filename: "a.png", contentType: "image/png" });
    expect(res.status).toBe(401);
  });

  it("cliente responde 403", async () => {
    const cookie = await loginAsCustomer(app);
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .field("folder", "prints")
      .attach("file", PNG_BYTES, { filename: "a.png", contentType: "image/png" });
    expect(res.status).toBe(403);
  });
});

describe("Admin · Uploads · validación", () => {
  it("sin archivo responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .field("folder", "prints");
    expect(res.status).toBe(400);
  });

  it("un archivo text/plain responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .field("folder", "prints")
      .attach("file", Buffer.from("no soy una imagen"), {
        filename: "a.txt",
        contentType: "text/plain",
      });
    expect(res.status).toBe(400);
  });

  it("un PNG con bytes reales pero mimetype declarado erróneo responde 400 (firma real, no header)", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .field("folder", "prints")
      .attach("file", Buffer.from("texto plano disfrazado"), {
        filename: "a.png",
        contentType: "image/png",
      });
    expect(res.status).toBe(400);
  });

  it("un archivo de más de 5MB responde 413", async () => {
    const cookie = await loginAsAdmin(app);
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(6 * 1024 * 1024, 0)]);
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .field("folder", "prints")
      .attach("file", big, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBe(413);
  });

  it("folder fuera del whitelist responde 400", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .field("folder", "hackers")
      .attach("file", PNG_BYTES, { filename: "a.png", contentType: "image/png" });
    expect(res.status).toBe(400);
  });
});

describe("Admin · Uploads · éxito", () => {
  it("sube un PNG válido y responde 201 con { url, publicId, width, height }", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .field("folder", "prints")
      .attach("file", PNG_BYTES, { filename: "a.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.data.image).toMatchObject({
      url: expect.stringMatching(/^https:\/\//),
      publicId: expect.any(String),
      width: expect.any(Number),
      height: expect.any(Number),
    });
  });

  it("registra auditoría IMAGE_UPLOADED", async () => {
    const cookie = await loginAsAdmin(app);
    await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .field("folder", "variants")
      .attach("file", PNG_BYTES, { filename: "a.png", contentType: "image/png" });
    const entries = await AuditLog.find({ action: "image_uploaded" }).lean();
    expect(entries).toHaveLength(1);
  });
});
