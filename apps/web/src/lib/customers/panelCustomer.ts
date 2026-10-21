import type { AdminCustomer, TopCustomer, Wire } from "@gira/shared";

/** A customer as the list and the detail hold it: metrics flattened, no nesting to remember. */
interface PanelCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  orderCount: number;
  /** Net MXN centavos. */
  spentMxn: number;
  lastOrderAt: string | null;
}

type PanelTopCustomer = Wire<TopCustomer>;

const toPanelCustomer = (customer: Wire<AdminCustomer>): PanelCustomer => ({
  id: customer.id,
  firstName: customer.firstName,
  lastName: customer.lastName,
  email: customer.email,
  emailVerified: customer.emailVerified,
  createdAt: customer.createdAt,
  orderCount: customer.stats.orderCount,
  spentMxn: customer.stats.spentMxn,
  lastOrderAt: customer.stats.lastOrderAt,
});

const customerFullName = (customer: { firstName: string; lastName: string }): string =>
  `${customer.firstName} ${customer.lastName}`.trim();

export type { PanelCustomer, PanelTopCustomer };
export { toPanelCustomer, customerFullName };
