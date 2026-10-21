const COUPON_CODE_MIN = 4;
const COUPON_CODE_MAX = 24;
/** Uppercase letters, digits and hyphens. */
const COUPON_CODE_PATTERN = /^[A-Z0-9-]+$/;
const COUPON_NAME_MIN = 2;
const COUPON_NAME_MAX = 80;
const COUPON_PERCENT_MIN = 1;
const COUPON_PERCENT_MAX = 100;
/** MXN centavos: from $1.00 to $100,000.00. */
const COUPON_AMOUNT_MIN = 100;
const COUPON_AMOUNT_MAX = 10_000_000;
/** MXN centavos. */
const COUPON_MIN_SUBTOTAL_MAX = 10_000_000;
const COUPON_MAX_REDEMPTIONS_MAX = 1_000_000;
/** The panel keys the duplicate-code error to the Código field by this exact message. */
const COUPON_CODE_TAKEN_MESSAGE = "Ya existe un cupón con este código.";

export {
  COUPON_CODE_MIN,
  COUPON_CODE_MAX,
  COUPON_CODE_PATTERN,
  COUPON_NAME_MIN,
  COUPON_NAME_MAX,
  COUPON_PERCENT_MIN,
  COUPON_PERCENT_MAX,
  COUPON_AMOUNT_MIN,
  COUPON_AMOUNT_MAX,
  COUPON_MIN_SUBTOTAL_MAX,
  COUPON_MAX_REDEMPTIONS_MAX,
  COUPON_CODE_TAKEN_MESSAGE,
};
