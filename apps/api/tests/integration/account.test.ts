import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { Print } from "../../src/models/Print.js";
import { Wishlist } from "../../src/models/Wishlist.js";
import { ORIGIN, createCustomer, loginCustomer, loginAsAdmin } from "../helpers/auth.js";
import { seedVariant } from "../helpers/seedInventory.js";

const app = buildApp();

const getAccount = (cookie?: string) => {
  const req = request(app).get("/api/v1/account");
  return cookie ? req.set("Cookie", cookie) : req;
};
const patchProfile = (cookie: string, body: Record<string, unknown>) =>
  request(app).patch("/api/v1/account/profile").set("Origin", ORIGIN).set("Cookie", cookie).send(body);

const setup = async () => {
  const customer = await createCustomer();
  const cookie = await loginCustomer(app, customer);
  return { customer, cookie };
};

describe("GET /account", () => {
  it("sin sesión responde 401", async () => {
    expect((await getAccount()).status).toBe(401);
  });

  it("un admin recibe 403", async () => {
    const cookie = await loginAsAdmin(app);
    expect((await getAccount(cookie)).status).toBe(403);
  });

  it("devuelve el perfil con los opcionales en null y sin campos sensibles", async () => {
    const { customer, cookie } = await setup();
    const res = await getAccount(cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toEqual({
      firstName: "Cliente",
      lastName: "Prueba",
      email: customer.email,
      phone: null,
      birthDate: null,
      city: null,
    });
    expect(res.body.data.addresses).toEqual([]);
    expect(res.body.data.billing).toBeNull();
    expect(res.body.data.savedCount).toBe(0);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/password|tokenVersion|twoFactor|role|emailVerification|passwordReset/);
  });

  it("savedCount cuenta solo lo guardado que sigue a la venta", async () => {
    const { customer, cookie } = await setup();
    const visible = await seedVariant({ tag: "ac1", onHand: 2 });
    const retired = await seedVariant({ tag: "ac2", onHand: 2 });
    await Print.updateOne({ _id: retired.printId }, { $set: { isActive: false } });
    await Wishlist.create([
      { user: customer.id, variant: visible.id },
      { user: customer.id, variant: retired.id },
    ]);
    expect((await getAccount(cookie)).body.data.savedCount).toBe(1);
  });
});

describe("PATCH /account/profile", () => {
  it("sin sesión responde 401 y un admin 403", async () => {
    const anon = await request(app).patch("/api/v1/account/profile").set("Origin", ORIGIN).send({ city: "CDMX" });
    expect(anon.status).toBe(401);
    const admin = await loginAsAdmin(app);
    expect((await patchProfile(admin, { city: "CDMX" })).status).toBe(403);
  });

  it("actualiza nombre, celular, nacimiento y ciudad", async () => {
    const { cookie } = await setup();
    const res = await patchProfile(cookie, {
      firstName: "  María ",
      lastName: "López",
      phone: "5512345678",
      birthDate: "1990-05-17",
      city: " Guadalajara ",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({
      firstName: "María",
      lastName: "López",
      phone: "5512345678",
      birthDate: "1990-05-17",
      city: "Guadalajara",
    });
    expect((await getAccount(cookie)).body.data.profile.birthDate).toBe("1990-05-17");
  });

  it("un campo ausente no se toca y null borra el opcional", async () => {
    const { cookie } = await setup();
    await patchProfile(cookie, { phone: "5512345678", city: "CDMX" });
    const res = await patchProfile(cookie, { phone: null });
    expect(res.status).toBe(200);
    expect(res.body.data.profile.phone).toBeNull();
    expect(res.body.data.profile.city).toBe("CDMX");
  });

  it("ignora email, role y otros campos no declarados", async () => {
    const { customer, cookie } = await setup();
    const res = await patchProfile(cookie, {
      city: "CDMX",
      email: "otro@example.com",
      role: "admin",
      emailVerified: false,
      isActive: false,
    });
    expect(res.status).toBe(200);
    const user = await User.findById(customer.id);
    expect(user?.email).toBe(customer.email);
    expect(user?.role).toBe("customer");
    expect(user?.emailVerified).toBe(true);
    expect(user?.isActive).toBe(true);
  });

  it.each([
    ["celular corto", { phone: "55123" }],
    ["celular con letras", { phone: "55123abcde" }],
    ["fecha futura", { birthDate: "2999-01-01" }],
    ["fecha anterior a 1900", { birthDate: "1899-12-31" }],
    ["fecha inexistente", { birthDate: "1990-02-31" }],
    ["fecha en otro formato", { birthDate: "17/05/1990" }],
    ["ciudad con HTML", { city: "<script>alert(1)</script>" }],
    ["ciudad demasiado larga", { city: "a".repeat(121) }],
    ["nombre con dígitos", { firstName: "Mar1a" }],
    ["cuerpo vacío", {}],
    ["solo campos desconocidos", { email: "otro@example.com" }],
  ])("rechaza %s con 400", async (_label, body) => {
    const { cookie } = await setup();
    expect((await patchProfile(cookie, body)).status).toBe(400);
  });
});
