import {
  CUSTOMER_RANK_LIMIT,
  DisputeStatus,
  UserRole,
  type CustomerRankPeriod,
  type CustomerRankSort,
  type TopCustomers,
} from "@gira/shared";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { NET_MXN_EXPR } from "../utils/orderMxnExpr.js";
import { resolveCurrentPeriod } from "../utils/resolveCurrentPeriod.js";
import { REVENUE_STATUSES } from "./orderStatsService.js";

/**
 * "Mejores clientes": customers WITH an account (orders carry `user`; guests never
 * rank), by calendar window in Mexico time. An order counts like revenue elsewhere
 * (REVENUE_STATUSES, no lost dispute); spend is net of the cumulative refund, in MXN.
 * The user lookup sits BEFORE the limit so test orders placed by admins cannot shrink the top.
 */

interface TopCustomersQuery {
  period: CustomerRankPeriod;
  sortBy: CustomerRankSort;
}

interface Row {
  _id: unknown;
  firstName: string;
  lastName: string;
  email: string;
  orderCount: number;
  spentMxn: number;
}

const getTopCustomers = async ({ period, sortBy }: TopCustomersQuery): Promise<TopCustomers> => {
  const range = resolveCurrentPeriod({ period });
  const sort: Record<string, 1 | -1> =
    sortBy === "orders"
      ? { orderCount: -1, spentMxn: -1, _id: 1 }
      : { spentMxn: -1, orderCount: -1, _id: 1 };

  const rows = await Order.aggregate<Row>([
    {
      $match: {
        user: { $exists: true },
        createdAt: { $gte: range.from, $lte: range.to },
        status: { $in: REVENUE_STATUSES },
        disputeStatus: { $ne: DisputeStatus.LOST },
      },
    },
    { $group: { _id: "$user", orderCount: { $sum: 1 }, spentMxn: { $sum: NET_MXN_EXPR } } },
    {
      $lookup: {
        from: User.collection.name,
        localField: "_id",
        foreignField: "_id",
        pipeline: [
          { $match: { role: UserRole.CUSTOMER } },
          { $project: { firstName: 1, lastName: 1, email: 1 } },
        ],
        as: "customer",
      },
    },
    { $unwind: "$customer" },
    { $sort: sort },
    { $limit: CUSTOMER_RANK_LIMIT },
    {
      $project: {
        orderCount: 1,
        spentMxn: 1,
        firstName: "$customer.firstName",
        lastName: "$customer.lastName",
        email: "$customer.email",
      },
    },
  ]);

  return {
    period,
    sortBy,
    from: range.from,
    to: range.to,
    rows: rows.map((row) => ({
      id: String(row._id),
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      orderCount: row.orderCount,
      spentMxn: row.spentMxn,
    })),
  };
};

export type { TopCustomersQuery };
export { getTopCustomers };
