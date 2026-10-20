/**
 * Cap on `Order.statusHistory`. The log is append-only, and an array without a
 * ceiling lets one document grow until it hits Mongo's 16 MB limit. Oldest
 * entries fall off first; the current status always lives in `Order.status`.
 * Never derive a business rule from the full history (e.g. "did it ever ship?")
 * without a persisted flag: past this cap the early entries are gone.
 */
const MAX_STATUS_HISTORY = 50;

/** Alphabet without I/O/0/1: the folio is dictated over the phone. */
const ORDER_NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ORDER_NUMBER_PREFIX = "GC-";
const ORDER_NUMBER_BODY_LENGTH = 8;
const ORDER_NUMBER_PATTERN = new RegExp(
  `^${ORDER_NUMBER_PREFIX}[${ORDER_NUMBER_ALPHABET}]{${String(ORDER_NUMBER_BODY_LENGTH)}}$`,
);

/** IVA included in catalog prices, in basis points (1600 = 16%). Lives in Settings; this is its default. */
const DEFAULT_TAX_RATE_BPS = 1600;

const CANCEL_REASON_MIN = 5;
const CANCEL_REASON_MAX = 300;
/** Upper bound of a bulk status change: one request must not fan out unbounded writes. */
const MAX_BULK_ORDERS = 50;
/** Activity feed cap (the audit log can grow without limit; the panel needs the latest). */
const MAX_ORDER_ACTIVITY = 100;
/** A refund the provider's webhook has not confirmed after this long may be requested again. */
const REFUND_REQUEST_STALE_MS = 24 * 60 * 60 * 1000;

export {
  MAX_STATUS_HISTORY,
  ORDER_NUMBER_ALPHABET,
  ORDER_NUMBER_PREFIX,
  ORDER_NUMBER_BODY_LENGTH,
  ORDER_NUMBER_PATTERN,
  DEFAULT_TAX_RATE_BPS,
  CANCEL_REASON_MIN,
  CANCEL_REASON_MAX,
  MAX_BULK_ORDERS,
  MAX_ORDER_ACTIVITY,
  REFUND_REQUEST_STALE_MS,
};
