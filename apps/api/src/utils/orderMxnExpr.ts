import { Currency } from "@gira/shared";

/**
 * Aggregation expression: an amount stored in the order's charge currency, as MXN
 * centavos. USD orders convert with the rate saved ON THAT ORDER (`exchangeRate` is
 * pesos per dollar in cents, hence the /100), never today's rate.
 */
const mxnOf = (amount: unknown): Record<string, unknown> => ({
  $cond: {
    if: { $eq: ["$currency", Currency.MXN] },
    then: amount,
    else: { $round: [{ $divide: [{ $multiply: [amount, "$exchangeRate"] }, 100] }, 0] },
  },
});

/** What the customer really paid: total minus the cumulative refund, converted to MXN. */
const NET_MXN_EXPR = mxnOf({
  $max: [0, { $subtract: ["$total", { $ifNull: ["$payment.refundedAmount", 0] }] }],
});

export { mxnOf, NET_MXN_EXPR };
