import type { HydratedDocument, Types } from "mongoose";
import {
  AuditAction,
  AuditModule,
  CouponDiscountType,
  CouponKind,
  COUPON_CODE_TAKEN_MESSAGE,
} from "@gira/shared";
import { Coupon, type CouponAttrs } from "../models/Coupon.js";
import { AppError } from "../utils/AppError.js";
import { isDuplicateKeyError } from "../utils/mongoErrors.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * Coupon CRUD, the only layer that writes the Coupon model. Retiring is a soft
 * delete (isActive=false): orders that already used the coupon keep their frozen
 * snapshot, so a retired coupon never rewrites history. Once a coupon has been
 * redeemed its code and discount are locked: they are what customers were promised.
 */

interface CreateCouponInput {
  code: string;
  name: string;
  discountType: CouponDiscountType;
  percentOff?: number;
  amountOffMxn?: number;
  minSubtotalMxn?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  maxRedemptions?: number | null;
  /** Set by couponGrantService only; the HTTP validator never lets a client send them. */
  kind?: CouponKind;
  assignedUser?: Types.ObjectId;
}

interface UpdateCouponInput {
  code?: string;
  name?: string;
  discountType?: CouponDiscountType;
  percentOff?: number;
  amountOffMxn?: number;
  minSubtotalMxn?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  maxRedemptions?: number | null;
  isActive?: boolean;
}

const NOT_FOUND = "El cupón no existe.";
const LOCKED_MESSAGE = "El cupón ya tiene canjes: no se pueden cambiar el código ni el descuento.";

const audit = (
  action: AuditAction,
  id: string,
  ctx: RequestContext,
  after?: Record<string, unknown>,
): Promise<void> =>
  recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action,
    module: AuditModule.COUPONS,
    targetId: id,
    ...(after ? { after } : {}),
    ip: ctx.ip,
  });

const createCoupon = async (input: CreateCouponInput, ctx: RequestContext): Promise<{ id: string }> => {
  let created: HydratedDocument<CouponAttrs>;
  try {
    // Explicit field assignment, never a spread of the payload (anti mass-assignment).
    created = await Coupon.create({
      code: input.code,
      name: input.name,
      discountType: input.discountType,
      ...(input.percentOff !== undefined ? { percentOff: input.percentOff } : {}),
      ...(input.amountOffMxn !== undefined ? { amountOffMxn: input.amountOffMxn } : {}),
      minSubtotalMxn: input.minSubtotalMxn ?? 0,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      maxRedemptions: input.maxRedemptions ?? null,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.assignedUser ? { assignedUser: input.assignedUser } : {}),
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(COUPON_CODE_TAKEN_MESSAGE, 409);
    throw err;
  }
  const id = String(created._id);
  if (input.kind === CouponKind.PERSONAL) {
    await audit(AuditAction.COUPON_GRANTED, id, ctx, { customerId: String(input.assignedUser) });
  } else {
    await audit(AuditAction.COUPON_CREATED, id, ctx);
  }
  return { id };
};

const updateCoupon = async (
  id: string,
  input: UpdateCouponInput,
  ctx: RequestContext,
): Promise<{ id: string }> => {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new AppError(NOT_FOUND, 404);

  const wasActive = coupon.isActive;
  const nextType = input.discountType ?? coupon.discountType;

  const changesDiscount =
    (input.code !== undefined && input.code !== coupon.code) ||
    (input.discountType !== undefined && input.discountType !== coupon.discountType) ||
    (input.percentOff !== undefined && input.percentOff !== coupon.percentOff) ||
    (input.amountOffMxn !== undefined && input.amountOffMxn !== coupon.amountOffMxn);
  if (coupon.redeemedCount > 0 && changesDiscount) throw new AppError(LOCKED_MESSAGE, 409);

  if (nextType === CouponDiscountType.PERCENT) {
    if (input.amountOffMxn !== undefined) throw new AppError("Este cupón no es de monto fijo.", 400);
    const value = input.percentOff ?? (coupon.discountType === nextType ? coupon.percentOff : undefined);
    if (value === undefined) throw new AppError("Escribe el porcentaje de descuento.", 400);
    coupon.discountType = nextType;
    coupon.percentOff = value;
    coupon.amountOffMxn = undefined as unknown as number;
  } else {
    if (input.percentOff !== undefined) throw new AppError("Este cupón no es de porcentaje.", 400);
    const value = input.amountOffMxn ?? (coupon.discountType === nextType ? coupon.amountOffMxn : undefined);
    if (value === undefined) throw new AppError("Escribe el monto de descuento.", 400);
    coupon.discountType = nextType;
    coupon.amountOffMxn = value;
    coupon.percentOff = undefined as unknown as number;
  }

  if (input.maxRedemptions !== undefined && input.maxRedemptions !== null) {
    if (input.maxRedemptions < coupon.redeemedCount) {
      throw new AppError(
        `El tope no puede ser menor a los canjes ya hechos (${coupon.redeemedCount}).`,
        409,
      );
    }
  }

  const startsAt = input.startsAt !== undefined ? input.startsAt : coupon.startsAt;
  const endsAt = input.endsAt !== undefined ? input.endsAt : coupon.endsAt;
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new AppError("La fecha de fin debe ser posterior al inicio.", 400);
  }

  if (input.code !== undefined) coupon.code = input.code;
  if (input.name !== undefined) coupon.name = input.name;
  if (input.minSubtotalMxn !== undefined) coupon.minSubtotalMxn = input.minSubtotalMxn;
  if (input.maxRedemptions !== undefined) coupon.maxRedemptions = input.maxRedemptions;
  coupon.startsAt = startsAt;
  coupon.endsAt = endsAt;
  if (input.isActive !== undefined) coupon.isActive = input.isActive;

  try {
    await coupon.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(COUPON_CODE_TAKEN_MESSAGE, 409);
    throw err;
  }

  const { isActive, ...fields } = input;
  const toggled = isActive !== undefined && isActive !== wasActive;
  if (Object.keys(fields).length > 0) await audit(AuditAction.COUPON_UPDATED, id, ctx);
  if (toggled) {
    await audit(isActive ? AuditAction.COUPON_REACTIVATED : AuditAction.COUPON_DEACTIVATED, id, ctx);
  }
  return { id };
};

/** Soft delete. Idempotent: retiring an already retired coupon writes no new audit row. */
const deactivateCoupon = async (id: string, ctx: RequestContext): Promise<{ id: string }> => {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new AppError(NOT_FOUND, 404);
  if (!coupon.isActive) return { id };

  coupon.isActive = false;
  await coupon.save();
  await audit(AuditAction.COUPON_DEACTIVATED, id, ctx);
  return { id };
};

export type { CreateCouponInput, UpdateCouponInput };
export { createCoupon, updateCoupon, deactivateCoupon };
