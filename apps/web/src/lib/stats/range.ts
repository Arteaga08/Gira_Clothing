/**
 * The API accepts any `days` from 1 to 365 (statsValidator.ts), but the
 * screen only offers three. Accepting an arbitrary value would leave the
 * segmented control with no active option — a state nobody designed and no
 * test covers — so anything outside this whitelist falls back to the
 * default silently. This is state closure, not security validation: the
 * guard and the API already own that.
 */
const RANGE_OPTIONS = [7, 30, 90] as const;
const DEFAULT_RANGE_DAYS: RangeDays = 30;

type RangeDays = (typeof RANGE_OPTIONS)[number];

/**
 * `searchParams` values from Next are `string | string[] | undefined` — an
 * array shows up when the query param repeats (`?dias=7&dias=90`), which is
 * ambiguous input, not "take the first match".
 */
const parseRangeDays = (raw: string | readonly string[] | undefined): RangeDays => {
  if (typeof raw !== "string") return DEFAULT_RANGE_DAYS;
  const parsed = Number(raw);
  const match = RANGE_OPTIONS.find((option) => option === parsed);
  return match ?? DEFAULT_RANGE_DAYS;
};

export { RANGE_OPTIONS, DEFAULT_RANGE_DAYS, parseRangeDays };
export type { RangeDays };
