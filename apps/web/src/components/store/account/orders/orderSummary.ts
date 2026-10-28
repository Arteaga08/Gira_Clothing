import type { CustomerOrder, Wire } from "@gira/shared";

/** «Playera Sol» or «Playera Sol y 2 más»: the first product and how many others the order holds. */
const orderSummary = (lines: Wire<CustomerOrder>["lines"]): string => {
  const first = lines[0];
  if (!first) return "Sin productos";
  const others = lines.length - 1;
  return others > 0 ? `${first.productName} y ${String(others)} más` : first.productName;
};

export { orderSummary };
