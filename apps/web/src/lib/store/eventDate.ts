/**
 * Event days are plain calendar days (YYYY-MM-DD, no time zone). They are read
 * as UTC midnight and formatted in UTC so the day never shifts with the
 * visitor's zone.
 */

interface EventDay {
  /** Day of the month, no leading zero: «14». */
  day: string;
  /** «NOV». */
  month: string;
  /** «SÁB». */
  weekday: string;
}

const LOCALE = "es-MX";

const toUtcDate = (date: string): Date => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year as number, (month as number) - 1, day));
};

const upper = (value: string): string => value.replace(".", "").toLocaleUpperCase(LOCALE);

const eventDay = (date: string): EventDay => {
  const at = toUtcDate(date);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: "UTC" }).format(at);
  return {
    day: part({ day: "numeric" }),
    month: upper(part({ month: "short" })),
    weekday: upper(part({ weekday: "short" })),
  };
};

/** «11:00 – 19:00», or «Desde las 11:00» when there is no closing time. */
const eventHours = (startTime: string, endTime: string): string =>
  endTime ? `${startTime} – ${endTime}` : `Desde las ${startTime}`;

export type { EventDay };
export { eventDay, eventHours };
