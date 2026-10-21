import { COUPON_MESSAGE_MAX } from "@gira/shared";
import {
  EMPTY_COUPON_VALUES,
  toCreateBody,
  validateCouponForm,
  type CouponFormValues,
  type CreateCouponBody,
} from "@/lib/coupons/couponForm";

/** The personal-coupon form: a campaign coupon without name or cap (the server fixes both), plus a note. */
type GiveCouponValues = Omit<CouponFormValues, "name" | "maxRedemptions"> & { message: string };
type GiveCouponErrors = Partial<Record<keyof GiveCouponValues, string | undefined>>;
type GiveCouponBody = Omit<CreateCouponBody, "name" | "maxRedemptions"> & { message?: string };

const EMPTY_GIVE_VALUES: GiveCouponValues = {
  code: EMPTY_COUPON_VALUES.code,
  discountType: EMPTY_COUPON_VALUES.discountType,
  percentOff: "",
  amountOff: "",
  minSubtotal: "",
  startsAt: "",
  endsAt: "",
  message: "",
};

// A neutral stand-in so the shared validator and body builder (which require a name and ignore an empty cap) can be reused.
const asCouponValues = ({ message: _message, ...values }: GiveCouponValues): CouponFormValues => ({
  ...values,
  name: "Personal",
  maxRedemptions: "",
});

const validateGiveForm = (values: GiveCouponValues): GiveCouponErrors => {
  const { name: _name, maxRedemptions: _cap, ...errors } = validateCouponForm(asCouponValues(values), false);
  const result: GiveCouponErrors = { ...errors };
  if (values.message.trim().length > COUPON_MESSAGE_MAX) {
    result.message = `El mensaje no puede pasar de ${COUPON_MESSAGE_MAX} caracteres.`;
  }
  return result;
};

/** Call only after `validateGiveForm` passed. */
const toGiveBody = (values: GiveCouponValues): GiveCouponBody => {
  const { name: _name, maxRedemptions: _cap, ...body } = toCreateBody(asCouponValues(values));
  const message = values.message.trim();
  return message ? { ...body, message } : body;
};

export type { GiveCouponValues, GiveCouponErrors, GiveCouponBody };
export { EMPTY_GIVE_VALUES, validateGiveForm, toGiveBody };
