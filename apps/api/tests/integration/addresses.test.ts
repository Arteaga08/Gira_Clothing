import { describe, it, expect } from "vitest";
import request from "supertest";
import { SAVED_ADDRESSES_MAX } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { ORIGIN, createCustomer, loginCustomer, loginAsAdmin } from "../helpers/auth.js";

const app = buildApp();

const ADDRESS = {
  recipient: "María López",
  line1: "Calle Reforma 123",
  district: "Centro",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "06000",
  country: "MX",
  phone: "55 1234-5678",
};

const post = (cookie: string | undefined, path: string, body?: Record<string, unknown>) => {
  const req = request(app).post(`/api/v1/account${path}`).set("Origin", ORIGIN);
  return (cookie ? req.set("Cookie", cookie) : req).send(body ?? {});
};
const patch = (cookie: string, path: string, body: Record<string, unknown>) =>
  request(app).patch(`/api/v1/account${path}`).set("Origin", ORIGIN).set("Cookie", cookie).send(body);
const del = (cookie: string, path: string) =>
  request(app).delete(`/api/v1/account${path}`).set("Origin", ORIGIN).set("Cookie", cookie);
const getAccount = (cookie: string) => request(app).get("/api/v1/account").set("Cookie", cookie);

const setup = async () => {
  const customer = await createCustomer();
  const cookie = await loginCustomer(app, customer);
  return { customer, cookie };
};

const addMany = async (cookie: string, count: number) => {
  for (let i = 0; i < count; i += 1) {
    const res = await post(cookie, "/addresses", { ...ADDRESS, label: `Dir ${String(i)}` });
    expect(res.status).toBe(201);
  }
};

describe("POST /account/addresses", () => {
  it("sin sesión 401 y un admin 403", async () => {
    expect((await post(undefined, "/addresses", ADDRESS)).status).toBe(401);
    const admin = await loginAsAdmin(app);
    expect((await post(admin, "/addresses", ADDRESS)).status).toBe(403);
  });

  it("guarda la dirección, deja solo dígitos en el celular y la primera es predeterminada", async () => {
    const { cookie } = await setup();
    const res = await post(cookie, "/addresses", { ...ADDRESS, label: "Casa" });
    expect(res.status).toBe(201);
    expect(res.body.data.addresses).toHaveLength(1);
    expect(res.body.data.addresses[0]).toMatchObject({
      label: "Casa",
      recipient: "María López",
      line2: null,
      state: "CX",
      country: "MX",
      phone: "5512345678",
      isDefault: true,
    });
    expect(res.body.data.addresses[0].id).toMatch(/^[a-f0-9]{24}$/);
  });

  it("guarda tal cual un texto que empieza con $ (no se interpreta como campo)", async () => {
    const { cookie } = await setup();
    const res = await post(cookie, "/addresses", { ...ADDRESS, line1: "$ofertas 100", label: "$addresses" });
    expect(res.status).toBe(201);
    expect(res.body.data.addresses[0]).toMatchObject({ line1: "$ofertas 100", label: "$addresses" });
  });

  it("la segunda no es predeterminada, salvo que se pida", async () => {
    const { cookie } = await setup();
    await post(cookie, "/addresses", ADDRESS);
    const second = await post(cookie, "/addresses", { ...ADDRESS, label: "Trabajo" });
    expect(second.body.data.addresses.map((a: { isDefault: boolean }) => a.isDefault)).toEqual([true, false]);
    const third = await post(cookie, "/addresses", { ...ADDRESS, label: "Otra", makeDefault: true });
    const defaults = third.body.data.addresses.filter((a: { isDefault: boolean }) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].label).toBe("Otra");
  });

  it("rechaza campos inválidos, HTML y un estado o país fuera de catálogo", async () => {
    const { cookie } = await setup();
    for (const bad of [
      { postalCode: "123" },
      { state: "ZZ" },
      { country: "US" },
      { phone: "123" },
      { recipient: "<script>x</script>" },
      { line1: "Calle <b>1</b>" },
      { label: "x".repeat(41) },
    ]) {
      expect((await post(cookie, "/addresses", { ...ADDRESS, ...bad })).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it("ignora isDefault, user y addresses del payload (stripUnknown)", async () => {
    const { cookie } = await setup();
    await post(cookie, "/addresses", ADDRESS);
    const res = await post(cookie, "/addresses", { ...ADDRESS, isDefault: true, role: "admin", addresses: [] });
    expect(res.status).toBe(201);
    expect(res.body.data.addresses).toHaveLength(2);
    expect(res.body.data.addresses[1].isDefault).toBe(false);
  });

  it(`el tope es ${String(SAVED_ADDRESSES_MAX)}: la siguiente responde 409`, async () => {
    const { cookie } = await setup();
    await addMany(cookie, SAVED_ADDRESSES_MAX);
    const res = await post(cookie, "/addresses", ADDRESS);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Puedes guardar hasta 5 direcciones. Elimina una para agregar otra.");
  });

  it("dos altas en paralelo con 4 guardadas no pasan del tope", async () => {
    const { customer, cookie } = await setup();
    await addMany(cookie, SAVED_ADDRESSES_MAX - 1);
    const results = await Promise.all([post(cookie, "/addresses", ADDRESS), post(cookie, "/addresses", ADDRESS)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const row = await User.findOne({ email: customer.email }).lean();
    expect(row?.addresses).toHaveLength(SAVED_ADDRESSES_MAX);
  });
});

describe("PATCH /account/addresses/:id", () => {
  it("edita campos sueltos y null borra etiqueta y línea 2", async () => {
    const { cookie } = await setup();
    const created = await post(cookie, "/addresses", { ...ADDRESS, label: "Casa", line2: "Depto 4" });
    const id = created.body.data.addresses[0].id as string;
    const res = await patch(cookie, `/addresses/${id}`, { city: "Puebla", label: null, line2: null });
    expect(res.status).toBe(200);
    expect(res.body.data.addresses[0]).toMatchObject({ city: "Puebla", label: null, line2: null, recipient: "María López" });
  });

  it("normaliza el celular al editar y un PATCH con solo country es «nada que actualizar»", async () => {
    const { cookie } = await setup();
    const created = await post(cookie, "/addresses", ADDRESS);
    const id = created.body.data.addresses[0].id as string;
    const res = await patch(cookie, `/addresses/${id}`, { phone: "55 9876-5432" });
    expect(res.body.data.addresses[0].phone).toBe("5598765432");
    expect((await patch(cookie, `/addresses/${id}`, { phone: "123" })).status).toBe(400);
    expect((await patch(cookie, `/addresses/${id}`, { country: "MX" })).status).toBe(400);
  });

  it("no cambia isDefault ni acepta un payload vacío", async () => {
    const { cookie } = await setup();
    const created = await post(cookie, "/addresses", ADDRESS);
    const id = created.body.data.addresses[0].id as string;
    expect((await patch(cookie, `/addresses/${id}`, {})).status).toBe(400);
    expect((await patch(cookie, `/addresses/${id}`, { isDefault: false })).status).toBe(400);
    const res = await patch(cookie, `/addresses/${id}`, { city: "Puebla", isDefault: false });
    expect(res.body.data.addresses[0].isDefault).toBe(true);
  });

  it("una dirección de otro cliente o un id mal formado responden 404 / 400", async () => {
    const mine = await setup();
    const other = await setup();
    const created = await post(other.cookie, "/addresses", ADDRESS);
    const foreignId = created.body.data.addresses[0].id as string;
    expect((await patch(mine.cookie, `/addresses/${foreignId}`, { city: "Hack" })).status).toBe(404);
    expect((await post(mine.cookie, `/addresses/${foreignId}/default`)).status).toBe(404);
    expect((await del(mine.cookie, `/addresses/${foreignId}`)).status).toBe(404);
    expect((await patch(mine.cookie, "/addresses/no-es-un-id", { city: "x" })).status).toBe(400);
    const intact = await getAccount(other.cookie);
    expect(intact.body.data.addresses[0].city).toBe("Ciudad de México");
  });
});

describe("POST /account/addresses/:id/default y DELETE", () => {
  it("predeterminar deja exactamente una", async () => {
    const { cookie } = await setup();
    await addMany(cookie, 3);
    const list = (await getAccount(cookie)).body.data.addresses as { id: string }[];
    const res = await post(cookie, `/addresses/${list[2]!.id}/default`);
    expect(res.status).toBe(200);
    expect(res.body.data.addresses.map((a: { isDefault: boolean }) => a.isDefault)).toEqual([false, false, true]);
  });

  it("borrar una normal conserva la predeterminada; borrar la predeterminada promueve otra", async () => {
    const { cookie } = await setup();
    await addMany(cookie, 3);
    const [first, second, third] = (await getAccount(cookie)).body.data.addresses as { id: string }[];
    const afterOther = await del(cookie, `/addresses/${third!.id}`);
    expect(afterOther.body.data.addresses.map((a: { isDefault: boolean }) => a.isDefault)).toEqual([true, false]);
    const afterDefault = await del(cookie, `/addresses/${first!.id}`);
    expect(afterDefault.body.data.addresses).toHaveLength(1);
    expect(afterDefault.body.data.addresses[0]).toMatchObject({ id: second!.id, isDefault: true });
    const afterLast = await del(cookie, `/addresses/${second!.id}`);
    expect(afterLast.body.data.addresses).toEqual([]);
  });

  it("tras borrar se puede volver a llenar hasta el tope", async () => {
    const { cookie } = await setup();
    await addMany(cookie, SAVED_ADDRESSES_MAX);
    const list = (await getAccount(cookie)).body.data.addresses as { id: string }[];
    await del(cookie, `/addresses/${list[0]!.id}`);
    expect((await post(cookie, "/addresses", ADDRESS)).status).toBe(201);
  });
});
