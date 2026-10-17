/**
 * Cap on `Order.statusHistory`. The log is append-only, and an array without a
 * ceiling lets one document grow until it hits Mongo's 16 MB limit. Oldest
 * entries fall off first; the current status always lives in `Order.status`.
 * Never derive a business rule from the full history (e.g. "did it ever ship?")
 * without a persisted flag: past this cap the early entries are gone.
 */
const MAX_STATUS_HISTORY = 50;

export { MAX_STATUS_HISTORY };
