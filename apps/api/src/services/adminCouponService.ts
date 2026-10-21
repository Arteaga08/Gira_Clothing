import { Types } from "mongoose";
import { CouponStatus, type AdminCoupon, type ApiMeta, type CouponDiscountType } from "@gira/shared";
import { Coupon } from "../models/Coupon.js";
import { AppError } from "../utils/AppError.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";
import type { COUPON_STATUS_FILTERS } from "../validators/couponValidator.js";

/**
 * Admin read model for coupons. The status is computed here, from the dates and
 * counters, so the panel never trusts the browser clock to say what is "vencido".
 * The list filter uses the same rules as computeCouponStatus, with a single `now`
 * per request so the rows and the filter agree.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["code", "createdAt", "redeemedCount", "endsAt"],
  searchable: ["code", "name"],
  defaultSort: "-createdAt",
  defaultLimit: 20,
};

/** Case-insensitive, accent-aware ordering for codes and names. */
const COLLATION = { locale: "es", strength: 2 } as const;

type CouponStatusFilter = (typeof COUPON_STATUS_FILTERS)[number];

interface AdminCouponListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  estado?: CouponStatusFilter;
}

interface CouponRow {
  _id: Types.ObjectId;
  code: string;
  name: string;
  discountType: CouponDiscountType;
  percentOff?: number;
  amountOffMxn?: number;
  minSubtotalMxn: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type StatusInput = Pick<CouponRow, "isActive" | "startsAt" | "endsAt" | "maxRedemptions" | "redeemedCount">;

/** Precedence: retired, expired, scheduled, exhausted, active. */
const computeCouponStatus = (c: StatusInput, now: Date): CouponStatus => {
  if (!c.isActive) return CouponStatus.RETIRED;
  if (c.endsAt && c.endsAt < now) return CouponStatus.EXPIRED;
  if (c.startsAt && c.startsAt > now) return CouponStatus.SCHEDULED;
  if (c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions) return CouponStatus.EXHAUSTED;
  return CouponStatus.ACTIVE;
};

/** The Mongo equivalent of computeCouponStatus, one clause per list filter. */
const statusFilter = (estado: CouponStatusFilter, now: Date): Record<string, unknown> | undefined => {
  const notExpired = { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] };
  const started = { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] };
  const notExhausted = {
    $or: [{ maxRedemptions: null }, { $expr: { $lt: ["$redeemedCount", "$maxRedemptions"] } }],
  };
  const exhausted = {
    maxRedemptions: { $ne: null },
    $expr: { $gte: ["$redeemedCount", "$maxRedemptions"] },
  };

  switch (estado) {
    case "retirados":
      return { isActive: false };
    case "vencidos":
      return { isActive: true, endsAt: { $lt: now } };
    case "programados":
      return { $and: [{ isActive: true }, notExpired, { startsAt: { $gt: now } }] };
    case "agotados":
      return { $and: [{ isActive: true }, notExpired, started, exhausted] };
    case "activos":
      return { $and: [{ isActive: true }, notExpired, started, notExhausted] };
    default:
      return undefined;
  }
};

const toAdminCoupon = (row: CouponRow, now: Date): AdminCoupon => ({
  id: String(row._id),
  code: row.code,
  name: row.name,
  discountType: row.discountType,
  ...(row.percentOff !== undefined ? { percentOff: row.percentOff } : {}),
  ...(row.amountOffMxn !== undefined ? { amountOffMxn: row.amountOffMxn } : {}),
  minSubtotalMxn: row.minSubtotalMxn,
  ...(row.startsAt ? { startsAt: row.startsAt.toISOString() } : {}),
  ...(row.endsAt ? { endsAt: row.endsAt.toISOString() } : {}),
  ...(row.maxRedemptions !== null ? { maxRedemptions: row.maxRedemptions } : {}),
  redeemedCount: row.redeemedCount,
  isActive: row.isActive,
  status: computeCouponStatus(row, now),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const listAdminCoupons = async (
  query: AdminCouponListQuery,
): Promise<{ items: AdminCoupon[]; meta: ApiMeta }> => {
  const now = new Date();
  const status = statusFilter(query.estado ?? "todos", now);
  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, status ?? {});

  const [result] = await Coupon.aggregate<{ rows: CouponRow[]; total: { n: number }[] }>([
    { $match: filter },
    {
      $facet: {
        rows: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
        total: [{ $count: "n" }],
      },
    },
  ]).collation(COLLATION);

  const total = result?.total[0]?.n ?? 0;
  return {
    items: (result?.rows ?? []).map((row) => toAdminCoupon(row, now)),
    meta: buildMeta(total, { page, limit }),
  };
};

const getAdminCouponOrThrow = async (id: string): Promise<AdminCoupon> => {
  const row = await Coupon.findById(new Types.ObjectId(id)).lean<CouponRow>();
  if (!row) throw new AppError("El cupón no existe.", 404);
  return toAdminCoupon(row, new Date());
};

export type { AdminCouponListQuery };
export { listAdminCoupons, getAdminCouponOrThrow, computeCouponStatus };
