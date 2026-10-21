/**
 * Coupon windows are calendar days in Mexico City, fixed at -06:00 (the country
 * dropped daylight saving in 2022). A start date means 00:00 of that day and an
 * end date means 23:59:59, so "termina el 31/08" includes the whole 31st.
 */

const MX_OFFSET_HOURS = 6;
const HOUR_MS = 3_600_000;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

interface MxDate {
  y: number;
  m: number;
  d: number;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** "dd/mm/aaaa" -> parts, or null when it is not a real calendar day. */
const parseMxDate = (input: string): MxDate | null => {
  const match = DATE_PATTERN.exec(input.trim());
  if (!match) return null;
  const [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  const real = probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
  return real ? { y, m, d } : null;
};

const startOfMxDayIso = ({ y, m, d }: MxDate): string =>
  new Date(Date.UTC(y, m - 1, d, MX_OFFSET_HOURS, 0, 0)).toISOString();

const endOfMxDayIso = ({ y, m, d }: MxDate): string =>
  new Date(Date.UTC(y, m - 1, d + 1, MX_OFFSET_HOURS - 1, 59, 59)).toISOString();

/** The Mexico calendar day an instant falls on. */
const mxDayOf = (iso: string): MxDate => {
  const shifted = new Date(new Date(iso).getTime() - MX_OFFSET_HOURS * HOUR_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
};

const isoToMxInput = (iso: string): string => {
  const { y, m, d } = mxDayOf(iso);
  return `${pad(d)}/${pad(m)}/${y}`;
};

/** "01 jun 2026". Fixed month names: no dependence on the ICU data of the runtime. */
const formatMxDate = (iso: string): string => {
  const { y, m, d } = mxDayOf(iso);
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
};

export type { MxDate };
export { parseMxDate, startOfMxDayIso, endOfMxDayIso, isoToMxInput, formatMxDate };
