import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { CouponDiscountType, CouponKind } from "@gira/shared";
import { Coupon } from "../../src/models/Coupon.js";
import { resolveCouponForCheckout } from "../../src/services/couponRulesService.js";
import { createCustomer } from "../helpers/auth.js";

const oid = (id: string) => new mongoose.Types.ObjectId(id);

const personal = (assignedUser: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) =>
  Coupon.create({
    code: "GRACIAS-ANA",
    name: "Personal · Ana",
    discountType: CouponDiscountType.PERCENT,
    percentOff: 15,
    kind: CouponKind.PERSONAL,
    assignedUser,
    maxRedemptions: 1,
    ...overrides,
  });

describe("Coupon personal · propiedad", () => {
  it("el dueño lo resuelve", async () => {
    const owner = await createCustomer();
    await personal(oid(owner.id));
    const coupon = await resolveCouponForCheckout("gracias-ana", oid(owner.id));
    expect(coupon.code).toBe("GRACIAS-ANA");
  });

  it("otro cliente recibe el mismo mensaje genérico que un código inexistente", async () => {
    const owner = await createCustomer({ email: "dueno@example.com" });
    const other = await createCustomer({ email: "otro@example.com" });
    await personal(oid(owner.id));
    const wrong = await resolveCouponForCheckout("GRACIAS-ANA", oid(other.id)).catch((e: Error) => e);
    const missing = await resolveCouponForCheckout("NO-EXISTE", oid(other.id)).catch((e: Error) => e);
    expect(wrong).toMatchObject({ message: "El cupón no es válido.", statusCode: 400 });
    expect((wrong as Error).message).toBe((missing as Error).message);
  });

  it("un invitado sigue recibiendo 401", async () => {
    const owner = await createCustomer();
    await personal(oid(owner.id));
    await expect(resolveCouponForCheckout("GRACIAS-ANA", undefined)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("un cupón sin kind (anterior a M12b) se comporta como campaña", async () => {
    const anyone = await createCustomer();
    await Coupon.collection.insertOne({
      code: "VIEJO10",
      name: "Viejo",
      discountType: CouponDiscountType.PERCENT,
      percentOff: 10,
      minSubtotalMxn: 0,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      redeemedCount: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const coupon = await resolveCouponForCheckout("VIEJO10", oid(anyone.id));
    expect(coupon.code).toBe("VIEJO10");
  });

  it("el esquema exige assignedUser en un personal y lo prohíbe en una campaña", async () => {
    await expect(
      Coupon.create({
        code: "SINDUENO",
        name: "x y",
        discountType: CouponDiscountType.PERCENT,
        percentOff: 5,
        kind: CouponKind.PERSONAL,
      }),
    ).rejects.toThrow(/assignedUser/);
    const owner = await createCustomer();
    await expect(
      Coupon.create({
        code: "CAMPANA5",
        name: "x y",
        discountType: CouponDiscountType.PERCENT,
        percentOff: 5,
        assignedUser: oid(owner.id),
      }),
    ).rejects.toThrow(/assignedUser/);
  });
});
