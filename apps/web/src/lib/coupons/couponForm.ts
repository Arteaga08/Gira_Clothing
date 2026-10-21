import {
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
import { endOfMxDayIso, isoToMxInput, parseMxDate, startOfMxDayIso } from "./dates";
import { centsToPesosInput, pesosToCents } from "./money";
import type { PanelCoupon } from "./panelCoupon";

type CouponKind = "percent" | "fixed";

/** The form as the inputs hold it: every value a string except the discount type. */
interface CouponFormValues {
  code: string;
  name: string;
  discountType: CouponKind;
  percentOff: string;
  amountOff: string;
  minSubtotal: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
}

type CouponFormErrors = Partial<Record<keyof CouponFormValues, string | undefined>>;

interface CreateCouponBody {
  code: string;
  name: string;
  discountType: CouponKind;
  percentOff?: number;
  amountOffMxn?: number;
  minSubtotalMxn?: number;
  startsAt?: string;
  endsAt?: string;
  maxRedemptions?: number;
}

interface UpdateCouponBody {
  code?: string;
  name?: string;
  discountType?: CouponKind;
  percentOff?: number;
  amountOffMxn?: number;
  minSubtotalMxn?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
}

const EMPTY_COUPON_VALUES: CouponFormValues = {
  code: "",
  name: "",
  discountType: "percent",
  percentOff: "",
  amountOff: "",
  minSubtotal: "",
  startsAt: "",
  endsAt: "",
  maxRedemptions: "",
};

const MONEY_FORMAT_ERROR = "Usa hasta 2 decimales, por ejemplo 150.50.";
const INTEGER_PATTERN = /^\d+$/;

const normalizeCode = (code: string): string => code.trim().toUpperCase();

const validateCode = (raw: string): string | undefined => {
  const code = normalizeCode(raw);
  if (code.length === 0) return "El código es obligatorio.";
  if (!COUPON_CODE_PATTERN.test(code)) return "El código solo admite letras, números y guiones.";
  if (code.length < COUPON_CODE_MIN || code.length > COUPON_CODE_MAX) {
    return `El código debe tener entre ${COUPON_CODE_MIN} y ${COUPON_CODE_MAX} caracteres.`;
  }
  return undefined;
};

const validateDiscount = (values: CouponFormValues): CouponFormErrors => {
  if (values.discountType === "percent") {
    const text = values.percentOff.trim();
    const value = Number(text);
    const ok = INTEGER_PATTERN.test(text) && value >= COUPON_PERCENT_MIN && value <= COUPON_PERCENT_MAX;
    return ok ? {} : { percentOff: "Escribe un porcentaje entero entre 1 y 100." };
  }
  const cents = pesosToCents(values.amountOff);
  if (cents === null) return { amountOff: MONEY_FORMAT_ERROR };
  if (cents < COUPON_AMOUNT_MIN || cents > COUPON_AMOUNT_MAX) {
    return { amountOff: "El monto debe estar entre $1.00 y $100,000.00." };
  }
  return {};
};

const validateDates = (values: CouponFormValues): CouponFormErrors => {
  const errors: CouponFormErrors = {};
  const start = values.startsAt.trim() ? parseMxDate(values.startsAt) : undefined;
  const end = values.endsAt.trim() ? parseMxDate(values.endsAt) : undefined;
  if (start === null) errors.startsAt = "Usa el formato dd/mm/aaaa.";
  if (end === null) errors.endsAt = "Usa el formato dd/mm/aaaa.";
  if (start && end && endOfMxDayIso(end) <= startOfMxDayIso(start)) errors.endsAt = "Debe ser posterior al inicio.";
  return errors;
};

/** `locked` = the coupon already has redemptions: code, type and value are read-only, so they are not checked. */
const validateCouponForm = (values: CouponFormValues, locked: boolean): CouponFormErrors => {
  const errors: CouponFormErrors = {};
  const name = values.name.trim();
  if (name.length < COUPON_NAME_MIN || name.length > COUPON_NAME_MAX) {
    errors.name = `El nombre debe tener entre ${COUPON_NAME_MIN} y ${COUPON_NAME_MAX} caracteres.`;
  }
  if (!locked) {
    const codeError = validateCode(values.code);
    if (codeError) errors.code = codeError;
    Object.assign(errors, validateDiscount(values));
  }
  if (values.minSubtotal.trim()) {
    const cents = pesosToCents(values.minSubtotal);
    if (cents === null) errors.minSubtotal = MONEY_FORMAT_ERROR;
    else if (cents > COUPON_MIN_SUBTOTAL_MAX) errors.minSubtotal = "La compra mínima excede el máximo permitido.";
  }
  Object.assign(errors, validateDates(values));
  if (values.maxRedemptions.trim()) {
    const text = values.maxRedemptions.trim();
    const value = Number(text);
    if (!INTEGER_PATTERN.test(text) || value < 1 || value > COUPON_MAX_REDEMPTIONS_MAX) {
      errors.maxRedemptions = "Escribe un número entero de 1 en adelante.";
    }
  }
  return errors;
};

const startIso = (value: string): string | undefined => {
  const date = value.trim() ? parseMxDate(value) : null;
  return date ? startOfMxDayIso(date) : undefined;
};
const endIso = (value: string): string | undefined => {
  const date = value.trim() ? parseMxDate(value) : null;
  return date ? endOfMxDayIso(date) : undefined;
};

/** Call only after `validateCouponForm` passed. Empty optionals are simply not sent. */
const toCreateBody = (values: CouponFormValues): CreateCouponBody => {
  const body: CreateCouponBody = {
    code: normalizeCode(values.code),
    name: values.name.trim(),
    discountType: values.discountType,
  };
  if (values.discountType === "percent") body.percentOff = Number(values.percentOff.trim());
  else body.amountOffMxn = pesosToCents(values.amountOff) as number;
  if (values.minSubtotal.trim()) body.minSubtotalMxn = pesosToCents(values.minSubtotal) as number;
  const startsAt = startIso(values.startsAt);
  const endsAt = endIso(values.endsAt);
  if (startsAt) body.startsAt = startsAt;
  if (endsAt) body.endsAt = endsAt;
  if (values.maxRedemptions.trim()) body.maxRedemptions = Number(values.maxRedemptions.trim());
  return body;
};

/** Only what changed. Clearing a date or the cap sends `null`; with `locked` the discount fields never leave. */
const toUpdateBody = (values: CouponFormValues, baseline: CouponFormValues, locked: boolean): UpdateCouponBody => {
  const body: UpdateCouponBody = {};
  const name = values.name.trim();
  if (name !== baseline.name.trim()) body.name = name;

  if (!locked) {
    const code = normalizeCode(values.code);
    if (code !== normalizeCode(baseline.code)) body.code = code;
    const typeChanged = values.discountType !== baseline.discountType;
    if (typeChanged) body.discountType = values.discountType;
    if (values.discountType === "percent") {
      if (typeChanged || values.percentOff.trim() !== baseline.percentOff.trim()) {
        body.percentOff = Number(values.percentOff.trim());
      }
    } else if (typeChanged || pesosToCents(values.amountOff) !== pesosToCents(baseline.amountOff)) {
      body.amountOffMxn = pesosToCents(values.amountOff) as number;
    }
  }

  const minNow = values.minSubtotal.trim() ? pesosToCents(values.minSubtotal) : 0;
  const minBefore = baseline.minSubtotal.trim() ? pesosToCents(baseline.minSubtotal) : 0;
  if (minNow !== minBefore) body.minSubtotalMxn = minNow as number;

  if (values.startsAt.trim() !== baseline.startsAt.trim()) body.startsAt = startIso(values.startsAt) ?? null;
  if (values.endsAt.trim() !== baseline.endsAt.trim()) body.endsAt = endIso(values.endsAt) ?? null;
  if (values.maxRedemptions.trim() !== baseline.maxRedemptions.trim()) {
    body.maxRedemptions = values.maxRedemptions.trim() ? Number(values.maxRedemptions.trim()) : null;
  }
  return body;
};

const valuesFromCoupon = (coupon: PanelCoupon): CouponFormValues => ({
  code: coupon.code,
  name: coupon.name,
  discountType: coupon.discountType,
  percentOff: coupon.percentOff !== undefined ? String(coupon.percentOff) : "",
  amountOff: coupon.amountOffMxn !== undefined ? centsToPesosInput(coupon.amountOffMxn) : "",
  minSubtotal: coupon.minSubtotalMxn > 0 ? centsToPesosInput(coupon.minSubtotalMxn) : "",
  startsAt: coupon.startsAt ? isoToMxInput(coupon.startsAt) : "",
  endsAt: coupon.endsAt ? isoToMxInput(coupon.endsAt) : "",
  maxRedemptions: coupon.maxRedemptions !== undefined ? String(coupon.maxRedemptions) : "",
});

export type { CouponFormValues, CouponFormErrors, CreateCouponBody, UpdateCouponBody, CouponKind };
export { EMPTY_COUPON_VALUES, validateCouponForm, toCreateBody, toUpdateBody, valuesFromCoupon };
