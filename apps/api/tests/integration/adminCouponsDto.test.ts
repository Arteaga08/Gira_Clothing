import { describe, it, expect } from "vitest";
import request from "supertest";
import { CouponDiscountType } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Coupon } from "../../src/models/Coupon.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { computeCouponStatus } from "../../src/services/adminCouponService.js";

const app = buildApp();
const BASE = "/api/v1/admin/coupons";
const DAY = 86_400_000;
const now = () => Date.now();

let seq = 0;
const seed = (overrides: Record<string, unknown> = {}) => {
  seq += 1;
  return Coupon.create({
    code: `SEED${String(seq).padStart(4, "0")}`,
    name: `Cupón ${seq}`,
    discountType: CouponDiscountType.PERCENT,
    percentOff: 10,
    ...overrides,
  });
};

const seedAll = async () => {
  await seed({ code: "ACTIVO001" });
  await seed({ code: "PROGRAMA01", startsAt: new Date(now() + DAY), endsAt: new Date(now() + 5 * DAY) });
  await seed({ code: "VENCIDO001", endsAt: new Date(now() - DAY) });
  await seed({ code: "AGOTADO001", maxRedemptions: 2, redeemedCount: 2 });
  await seed({ code: "RETIRADO01", isActive: false });
  // Precedence: retired beats expired, expired beats exhausted.
  await seed({ code: "RETVENC001", isActive: false, endsAt: new Date(now() - DAY) });
  await seed({ code: "VENCAGOT01", endsAt: new Date(now() - DAY), maxRedemptions: 1, redeemedCount: 1 });
};

const list = async (query = "") => {
  const cookie = await loginAsAdmin(app);
  return request(app).get(`${BASE}${query}`).set("Cookie", cookie);
};

const codes = (res: request.Response): string[] =>
  (res.body.data.coupons as { code: string }[]).map((c) => c.code).sort();

describe("computeCouponStatus", () => {
  const base = { isActive: true, startsAt: null, endsAt: null, maxRedemptions: null, redeemedCount: 0 };
  const at = new Date();
  it("aplica la precedencia retirado > vencido > programado > agotado > activo", () => {
    expect(computeCouponStatus({ ...base, isActive: false, endsAt: new Date(+at - DAY) }, at)).toBe("retired");
    expect(computeCouponStatus({ ...base, endsAt: new Date(+at - DAY), maxRedemptions: 1, redeemedCount: 1 }, at)).toBe("expired");
    expect(computeCouponStatus({ ...base, startsAt: new Date(+at + DAY), maxRedemptions: 1, redeemedCount: 1 }, at)).toBe("scheduled");
    expect(computeCouponStatus({ ...base, maxRedemptions: 1, redeemedCount: 1 }, at)).toBe("exhausted");
    expect(computeCouponStatus(base, at)).toBe("active");
  });
});

describe("Admin · Coupon · DTO y listado", () => {
  it("cada cupón trae su estado calculado", async () => {
    await seedAll();
    const res = await list("?limit=50");
    const byCode = Object.fromEntries(
      (res.body.data.coupons as { code: string; status: string }[]).map((c) => [c.code, c.status]),
    );
    expect(byCode).toMatchObject({
      ACTIVO001: "active",
      PROGRAMA01: "scheduled",
      VENCIDO001: "expired",
      AGOTADO001: "exhausted",
      RETIRADO01: "retired",
      RETVENC001: "retired",
      VENCAGOT01: "expired",
    });
  });

  it.each([
    ["activos", ["ACTIVO001"]],
    ["programados", ["PROGRAMA01"]],
    ["vencidos", ["VENCAGOT01", "VENCIDO001"]],
    ["agotados", ["AGOTADO001"]],
    ["retirados", ["RETIRADO01", "RETVENC001"]],
  ])("?estado=%s devuelve exactamente esos cupones", async (estado, expected) => {
    await seedAll();
    expect(codes(await list(`?estado=${estado}&limit=50`))).toEqual(expected);
  });

  it("?estado=todos (y sin filtro) devuelve todos", async () => {
    await seedAll();
    expect((await list("?estado=todos&limit=50")).body.meta.total).toBe(7);
    expect((await list("?limit=50")).body.meta.total).toBe(7);
  });

  it("estado inválido responde 400", async () => {
    expect((await list("?estado=cualquiera")).status).toBe(400);
  });

  it("busca por código y por nombre, sin importar mayúsculas", async () => {
    await seed({ code: "BUSCAME01", name: "Campaña Primavera" });
    await seed({ code: "OTRO00001", name: "Otro" });
    expect(codes(await list("?search=buscame"))).toEqual(["BUSCAME01"]);
    expect(codes(await list("?search=primavera"))).toEqual(["BUSCAME01"]);
  });

  it("escapa los metacaracteres de la búsqueda", async () => {
    await seed({ code: "NORMAL001" });
    expect(codes(await list("?search=.*"))).toEqual([]);
  });

  it("ordena por código, canjes y más recientes por defecto; sort inválido cae al default", async () => {
    await seed({ code: "BBBB0001", redeemedCount: 5 });
    await seed({ code: "AAAA0001", redeemedCount: 9 });
    await seed({ code: "CCCC0001", redeemedCount: 1 });
    const order = async (q: string) =>
      (await list(q)).body.data.coupons.map((c: { code: string }) => c.code);
    expect(await order("?sort=code")).toEqual(["AAAA0001", "BBBB0001", "CCCC0001"]);
    expect(await order("?sort=-redeemedCount")).toEqual(["AAAA0001", "BBBB0001", "CCCC0001"]);
    expect(await order("")).toEqual(["CCCC0001", "AAAA0001", "BBBB0001"]);
    expect(await order("?sort=passwordHash")).toEqual(["CCCC0001", "AAAA0001", "BBBB0001"]);
  });

  it("pagina", async () => {
    for (let i = 0; i < 5; i += 1) await seed();
    const res = await list("?limit=2&page=3");
    expect(res.body.data.coupons).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 5, page: 3, limit: 2, pages: 3 });
  });

  it("el DTO expone id y fechas ISO, sin campos internos", async () => {
    await seed({ code: "DTO000001", startsAt: new Date(now() - DAY), maxRedemptions: 3 });
    const coupon = (await list("")).body.data.coupons[0];
    expect(typeof coupon.id).toBe("string");
    expect(coupon._id).toBeUndefined();
    expect(coupon.__v).toBeUndefined();
    expect(new Date(coupon.createdAt).toISOString()).toBe(coupon.createdAt);
    expect(new Date(coupon.startsAt).toISOString()).toBe(coupon.startsAt);
    expect(coupon.maxRedemptions).toBe(3);
    expect(coupon.endsAt).toBeUndefined();
  });
});
