import { Currency } from "@gira/shared";
import { formatMoneyParts } from "@/lib/format";

/** "$1,120.00": integer minor units in, one formatted string out. */
const formatMoney = (cents: number, currency: Currency = Currency.MXN): string => {
  const { amount, fraction } = formatMoneyParts(cents, currency);
  return `${amount}${fraction}`;
};

export { formatMoney };
