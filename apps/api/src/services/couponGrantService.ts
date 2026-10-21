import type { Types } from "mongoose";
import { CouponDiscountType, CouponKind, Currency, UserRole, type GiveCouponResult } from "@gira/shared";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import type { RequestContext } from "../utils/requestContext.js";
import { formatMoney } from "../templates/orderEmails.js";
import { getAdminCouponOrThrow } from "./adminCouponService.js";
import { sendCouponEmail } from "./couponMailService.js";
import { createCoupon } from "./couponService.js";

/**
 * A personal coupon: created for ONE customer (kind personal, assignedUser, one use) and
 * emailed to them. The coupon is the source of truth: if the email fails it still
 * exists and the panel is told (`emailSent: false`) so the admin can pass the code on.
 */

interface GiveCouponInput {
  code: string;
  discountType: CouponDiscountType;
  percentOff?: number;
  amountOffMxn?: number;
  minSubtotalMxn?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  message?: string;
}

const MX_DATE = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "long" });

const giveCouponToCustomer = async (
  customerId: string | Types.ObjectId,
  input: GiveCouponInput,
  ctx: RequestContext,
): Promise<GiveCouponResult> => {
  const customer = await User.findOne({ _id: customerId, role: UserRole.CUSTOMER, isActive: true }).select(
    "firstName lastName email",
  );
  if (!customer) throw new AppError("El cliente no existe.", 404);

  const { id } = await createCoupon(
    {
      code: input.code,
      name: `Personal · ${customer.firstName} ${customer.lastName}`.slice(0, 80),
      discountType: input.discountType,
      ...(input.percentOff !== undefined ? { percentOff: input.percentOff } : {}),
      ...(input.amountOffMxn !== undefined ? { amountOffMxn: input.amountOffMxn } : {}),
      ...(input.minSubtotalMxn !== undefined ? { minSubtotalMxn: input.minSubtotalMxn } : {}),
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      maxRedemptions: 1,
      kind: CouponKind.PERSONAL,
      assignedUser: customer._id,
    },
    ctx,
  );

  const coupon = await getAdminCouponOrThrow(id);
  const message = input.message?.trim();
  const emailSent = await sendCouponEmail({
    to: customer.email,
    firstName: customer.firstName,
    code: coupon.code,
    discountLabel:
      coupon.discountType === CouponDiscountType.PERCENT
        ? `${coupon.percentOff ?? 0}% de descuento`
        : `${formatMoney(coupon.amountOffMxn ?? 0, Currency.MXN)} de descuento`,
    ...(coupon.minSubtotalMxn > 0 ? { minSubtotalLabel: formatMoney(coupon.minSubtotalMxn, Currency.MXN) } : {}),
    ...(coupon.endsAt ? { endsAtLabel: MX_DATE.format(new Date(coupon.endsAt)) } : {}),
    ...(message ? { message } : {}),
  });

  return { coupon, emailSent };
};

export type { GiveCouponInput };
export { giveCouponToCustomer };
