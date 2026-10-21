import { Types } from "mongoose";
import { DisputeStatus, UserRole, type AdminCustomer, type ApiMeta, type CustomerStats } from "@gira/shared";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { NET_MXN_EXPR } from "../utils/orderMxnExpr.js";
import { buildMeta, parseListQuery, type ListQueryConfig, type RawListQuery } from "../utils/parseListQuery.js";
import { REVENUE_STATUSES } from "./orderStatsService.js";

/**
 * Admin read model for customers (role customer only). The list/detail metrics are
 * lifetime (no date window) and computed only for the ids on the page, in one
 * aggregate: never per-row queries.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "firstName", "lastName", "email"],
  searchable: ["firstName", "lastName", "email"],
  defaultSort: "-createdAt",
  defaultLimit: 20,
};

const NOT_FOUND = "El cliente no existe.";
const EMPTY_STATS: CustomerStats = { orderCount: 0, spentMxn: 0, lastOrderAt: null };
const SELECT = "firstName lastName email emailVerified createdAt";

interface CustomerLean {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified?: boolean;
  createdAt: Date;
}

const statsFor = async (ids: Types.ObjectId[]): Promise<Map<string, CustomerStats>> => {
  const rows = await Order.aggregate<{ _id: Types.ObjectId; orderCount: number; spentMxn: number; lastOrderAt: Date }>([
    {
      $match: {
        user: { $in: ids },
        status: { $in: REVENUE_STATUSES },
        disputeStatus: { $ne: DisputeStatus.LOST },
      },
    },
    {
      $group: {
        _id: "$user",
        orderCount: { $sum: 1 },
        spentMxn: { $sum: NET_MXN_EXPR },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
  ]);
  return new Map(
    rows.map((row) => [
      String(row._id),
      { orderCount: row.orderCount, spentMxn: row.spentMxn, lastOrderAt: row.lastOrderAt },
    ]),
  );
};

const toAdminCustomer = (doc: CustomerLean, stats: CustomerStats | undefined): AdminCustomer => ({
  id: String(doc._id),
  firstName: doc.firstName,
  lastName: doc.lastName,
  email: doc.email,
  emailVerified: doc.emailVerified ?? false,
  createdAt: doc.createdAt,
  stats: stats ?? EMPTY_STATS,
});

const listAdminCustomers = async (
  query: RawListQuery,
): Promise<{ items: AdminCustomer[]; meta: ApiMeta }> => {
  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, { role: UserRole.CUSTOMER });
  const [docs, total] = await Promise.all([
    User.find(filter).select(SELECT).sort(sort).skip(skip).limit(limit).lean<CustomerLean[]>(),
    User.countDocuments(filter),
  ]);
  const stats = await statsFor(docs.map((doc) => doc._id));
  return {
    items: docs.map((doc) => toAdminCustomer(doc, stats.get(String(doc._id)))),
    meta: buildMeta(total, { page, limit }),
  };
};

const getAdminCustomerOrThrow = async (id: string): Promise<AdminCustomer> => {
  const doc = await User.findOne({ _id: new Types.ObjectId(id), role: UserRole.CUSTOMER })
    .select(SELECT)
    .lean<CustomerLean>();
  if (!doc) throw new AppError(NOT_FOUND, 404);
  const stats = await statsFor([doc._id]);
  return toAdminCustomer(doc, stats.get(String(doc._id)));
};

export { listAdminCustomers, getAdminCustomerOrThrow };
