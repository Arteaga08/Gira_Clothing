import Joi from "joi";
import {
  CouponDiscountType,
  COUPON_AMOUNT_MAX,
  COUPON_AMOUNT_MIN,
  COUPON_CODE_MAX,
  COUPON_CODE_MIN,
  COUPON_CODE_PATTERN,
  COUPON_MAX_REDEMPTIONS_MAX,
  COUPON_MIN_SUBTOTAL_MAX,
  COUPON_NAME_MAX,
  COUPON_NAME_MIN,
  COUPON_PERCENT_MAX,
  COUPON_PERCENT_MIN,
} from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const codeLength = `El código debe tener entre ${COUPON_CODE_MIN} y ${COUPON_CODE_MAX} caracteres.`;
const code = Joi.string()
  .trim()
  .uppercase()
  .min(COUPON_CODE_MIN)
  .max(COUPON_CODE_MAX)
  .pattern(COUPON_CODE_PATTERN)
  .messages({
    "string.min": codeLength,
    "string.max": codeLength,
    "string.pattern.base": "El código solo admite letras, números y guiones.",
    "any.required": "El código es obligatorio.",
    "string.empty": "El código es obligatorio.",
  });

const name = Joi.string().trim().min(COUPON_NAME_MIN).max(COUPON_NAME_MAX).messages({
  "string.min": `El nombre debe tener al menos ${COUPON_NAME_MIN} caracteres.`,
  "string.max": `El nombre no puede exceder ${COUPON_NAME_MAX} caracteres.`,
  "any.required": "El nombre es obligatorio.",
  "string.empty": "El nombre es obligatorio.",
});

const percentOff = Joi.number()
  .integer()
  .min(COUPON_PERCENT_MIN)
  .max(COUPON_PERCENT_MAX)
  .messages({
    "number.base": "Escribe un porcentaje entre 1 y 100.",
    "number.integer": "El porcentaje debe ser un número entero.",
    "number.min": "El porcentaje mínimo es 1.",
    "number.max": "El porcentaje máximo es 100.",
    "any.required": "Escribe el porcentaje de descuento.",
    "any.unknown": "Este cupón no es de porcentaje.",
  });

const amountOffMxn = Joi.number().integer().min(COUPON_AMOUNT_MIN).max(COUPON_AMOUNT_MAX).messages({
  "number.base": "Escribe un monto válido.",
  "number.integer": "El monto no es válido.",
  "number.min": "El monto mínimo es $1.00.",
  "number.max": "El monto excede el máximo permitido.",
  "any.required": "Escribe el monto de descuento.",
  "any.unknown": "Este cupón no es de monto fijo.",
});

const minSubtotalMxn = Joi.number().integer().min(0).max(COUPON_MIN_SUBTOTAL_MAX).messages({
  "number.base": "Escribe una compra mínima válida.",
  "number.min": "La compra mínima no puede ser negativa.",
  "number.max": "La compra mínima excede el máximo permitido.",
});

/** null = unlimited. */
const maxRedemptions = Joi.number()
  .integer()
  .min(1)
  .max(COUPON_MAX_REDEMPTIONS_MAX)
  .allow(null)
  .messages({
    "number.base": "Escribe un tope válido.",
    "number.integer": "El tope debe ser un número entero.",
    "number.min": "El tope debe ser al menos 1.",
    "number.max": "El tope excede el máximo permitido.",
  });

const startsAt = Joi.date().iso().allow(null).messages({ "date.base": "La fecha de inicio no es válida." });
const endsAt = Joi.date()
  .iso()
  .allow(null)
  .when("startsAt", { is: Joi.date().required(), then: Joi.date().greater(Joi.ref("startsAt")) })
  .messages({
    "date.base": "La fecha de fin no es válida.",
    "date.greater": "La fecha de fin debe ser posterior al inicio.",
  });

const createCouponSchema = Joi.object({
  code: code.required(),
  name: name.required(),
  discountType: Joi.string()
    .valid(...Object.values(CouponDiscountType))
    .required()
    .messages({ "any.required": "Elige el tipo de descuento.", "any.only": "El tipo de descuento no es válido." }),
  percentOff: Joi.when("discountType", {
    is: CouponDiscountType.PERCENT,
    then: percentOff.required(),
    otherwise: Joi.forbidden(),
  }),
  amountOffMxn: Joi.when("discountType", {
    is: CouponDiscountType.FIXED,
    then: amountOffMxn.required(),
    otherwise: Joi.forbidden(),
  }),
  minSubtotalMxn,
  startsAt,
  endsAt,
  maxRedemptions,
});

const updateCouponSchema = Joi.object({
  code,
  name,
  discountType: Joi.string().valid(...Object.values(CouponDiscountType)),
  percentOff,
  amountOffMxn,
  minSubtotalMxn,
  startsAt,
  endsAt,
  maxRedemptions,
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const COUPON_STATUS_FILTERS = ["todos", "activos", "programados", "vencidos", "agotados", "retirados"] as const;

const couponListQuerySchema = listQueryBase.keys({
  estado: Joi.string()
    .valid(...COUPON_STATUS_FILTERS)
    .default("todos"),
});

export { createCouponSchema, updateCouponSchema, couponListQuerySchema, COUPON_STATUS_FILTERS };
