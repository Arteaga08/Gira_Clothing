import { STATS_GRANULARITIES, type StatsGranularity } from "@gira/shared";

/**
 * Buckets a resolved day-level window (`parseDayRange`'s `dayKeys`) into
 * week/month/year groups for the timeseries chart. Two halves that MUST
 * agree on the same instant: `bucketKeyFor` (JS, used to build the zero-fill
 * series) and `bucketExpr` (Mongo, used to group real documents) — a
 * disagreement between them means real data lands on a bucket key the
 * zero-fill never generated, and it silently vanishes from the series.
 *
 * `day` itself needs none of this: `parseDayRange` already produces exactly
 * one key per calendar day.
 */

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Monday of the ISO week containing `dayKey`, as "YYYY-MM-DD". Plain Y/M/D
 *  component arithmetic — the input is already a resolved LOCAL day key, so
 *  no timezone conversion happens here (mirrors this codebase's existing
 *  Y/M/D-as-plain-numbers style in parseDayRange.ts). */
const mondayOf = (dayKey: string): string => {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  const anchor = new Date(Date.UTC(year, month - 1, day));
  const isoDayOfWeek = (anchor.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  anchor.setUTCDate(anchor.getUTCDate() - isoDayOfWeek);
  return `${anchor.getUTCFullYear()}-${pad2(anchor.getUTCMonth() + 1)}-${pad2(anchor.getUTCDate())}`;
};

/** The bucket-start key a given local day key belongs to. */
const bucketKeyFor = (dayKey: string, granularity: StatsGranularity): string => {
  if (granularity === "day") return dayKey;
  if (granularity === "week") return mondayOf(dayKey);

  const [year, month] = dayKey.split("-").map(Number) as [number, number, number];
  return granularity === "month" ? `${year}-${pad2(month)}-01` : `${year}-01-01`;
};

/** Ordered, de-duplicated bucket-start keys covering `dayKeys`, for
 *  zero-filling the series regardless of granularity. */
const enumerateBucketKeys = (dayKeys: readonly string[], granularity: StatsGranularity): string[] => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const day of dayKeys) {
    const bucket = bucketKeyFor(day, granularity);
    if (!seen.has(bucket)) {
      seen.add(bucket);
      ordered.push(bucket);
    }
  }
  return ordered;
};

/** Mongo-side counterpart of `bucketKeyFor`, for the `$group._id` expression. */
const bucketExpr = (granularity: StatsGranularity, timezone: string): Record<string, unknown> => {
  if (granularity === "day") {
    return { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone } };
  }
  return {
    $dateToString: {
      date: {
        $dateTrunc: {
          date: "$createdAt",
          unit: granularity,
          timezone,
          ...(granularity === "week" ? { startOfWeek: "monday" } : {}),
        },
      },
      format: "%Y-%m-%d",
      timezone,
    },
  };
};

/** Defensive re-validation at the service layer, mirroring
 *  parseStatsRange/parseDayRange's own style: Joi already whitelists this at
 *  the route, but a service function should not trust an `unknown` query
 *  value it did not itself validate. */
const parseGranularity = (raw: unknown): StatsGranularity =>
  typeof raw === "string" && (STATS_GRANULARITIES as readonly string[]).includes(raw)
    ? (raw as StatsGranularity)
    : "day";

export { pad2, bucketKeyFor, enumerateBucketKeys, bucketExpr, parseGranularity };
