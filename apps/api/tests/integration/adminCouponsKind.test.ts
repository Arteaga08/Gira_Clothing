import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { CouponDiscountType, CouponKind } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Coupon } from "../../src/models/Coupon.js";
import { createCustomer, loginAsAdmin } from "../helpers/auth.js";

const app = buildApp();
const BASE = "/api/v1/admin/coupons";

const seed = async () => {
  const ana = await createCustomer({ email: "ana@example.com" });
  await Coupon.create({ code: "VERANO10", name: "Verano", discountType: CouponDiscountType.PERCENT, percentOff: 10 });
  await Coupon.create({
    code: "GRACIAS-ANA",
    name: "Personal · Cliente Prueba",
    discountType: CouponDiscountType.PERCENT,
    percentOff: 15,
    kind: CouponKind.PERSONAL,
    assignedUser: new mongoose.Types.ObjectId(ana.id),
    maxRedemptions: 1,
  });
  return ana;
};

describe("Admin coupons · clase", () => {
  it("el DTO trae kind y el cliente asignado solo en los personales", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await seed();
    const res = await request(app).get(BASE).set("cookie", cookie);
    const byCode = Object.fromEntries(res.body.data.coupons.map((c: { code: string }) => [c.code, c]));
    expect(byCode.VERANO10).toMatchObject({ kind: "campaign" });
    expect(byCode.VERANO10).not.toHaveProperty("assignedCustomer");
    expect(byCode["GRACIAS-ANA"]).toMatchObject({
      kind: "personal",
      assignedCustomer: { id: ana.id, firstName: "Cliente", lastName: "Prueba" },
    });
    expect(JSON.stringify(res.body)).not.toContain("ana@example.com");
  });

  it("filtra por clase", async () => {
    const cookie = await loginAsAdmin(app);
    await seed();
    const camp = await request(app).get(`${BASE}?clase=campanas`).set("cookie", cookie);
    const pers = await request(app).get(`${BASE}?clase=personales`).set("cookie", cookie);
    expect(camp.body.data.coupons.map((c: { code: string }) => c.code)).toEqual(["VERANO10"]);
    expect(pers.body.data.coupons.map((c: { code: string }) => c.code)).toEqual(["GRACIAS-ANA"]);
    expect((await request(app).get(`${BASE}?clase=otra`).set("cookie", cookie)).status).toBe(400);
  });

  it("el detalle también trae el cliente asignado", async () => {
    const cookie = await loginAsAdmin(app);
    await seed();
    const coupon = await Coupon.findOne({ code: "GRACIAS-ANA" });
    const res = await request(app).get(`${BASE}/${coupon!.id}`).set("cookie", cookie);
    expect(res.body.data.coupon.assignedCustomer).toBeTruthy();
  });

  it("al crear una campaña por POST /admin/coupons ignora kind y assignedUser", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer();
    const res = await request(app)
      .post(BASE)
      .set("Origin", "http://localhost:3000")
      .set("cookie", cookie)
      .send({ code: "CAMP10", name: "Camp", discountType: "percent", percentOff: 10, kind: "personal", assignedUser: ana.id });
    expect(res.status).toBe(201);
    expect(res.body.data.coupon.kind).toBe("campaign");
  });
});
