import { vi } from "vitest";
import type { PanelCustomer } from "@/lib/customers/panelCustomer";

const CUSTOMER_ID = "68f2ab12c3d4e5f6a7b8cbb1";
const CUSTOMER_2_ID = "68f2ab12c3d4e5f6a7b8cbb2";

const makePanelCustomer = (overrides: Partial<PanelCustomer> = {}): PanelCustomer => ({
  id: CUSTOMER_ID,
  firstName: "Mariana",
  lastName: "Ocampo",
  email: "mariana@example.com",
  emailVerified: true,
  createdAt: "2026-03-12T10:00:00.000Z",
  orderCount: 19,
  spentMxn: 4_826_000,
  lastOrderAt: "2026-10-18T10:00:00.000Z",
  ...overrides,
});

const makeTopRow = (index: number, overrides: Record<string, unknown> = {}) => ({
  id: `68f2ab12c3d4e5f6a7b8c${String(index).padStart(3, "0")}`,
  firstName: `Cliente${index}`,
  lastName: "Prueba",
  email: `cliente${index}@example.com`,
  orderCount: index,
  spentMxn: 1_000_000 - index * 10_000,
  ...overrides,
});

const makeRanking = (count = 5, period = "month", sortBy = "spent") => ({
  period,
  sortBy,
  from: "2026-10-01T06:00:00.000Z",
  to: "2026-10-21T16:00:00.000Z",
  rows: Array.from({ length: count }, (_, index) => makeTopRow(index + 1)),
});

const makeCustomerClientMock = () => ({
  top: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  giveCoupon: vi.fn(),
});

export { CUSTOMER_ID, CUSTOMER_2_ID, makePanelCustomer, makeTopRow, makeRanking, makeCustomerClientMock };
