import { describe, it, expect } from "vitest";
import { customerFullName, toPanelCustomer } from "@/lib/customers/panelCustomer";

describe("panelCustomer", () => {
  it("aplana las métricas y arma el nombre", () => {
    const customer = toPanelCustomer({
      id: "68f2ab12c3d4e5f6a7b8caa1",
      firstName: "Ana",
      lastName: "Pérez",
      email: "ana@example.com",
      emailVerified: true,
      createdAt: "2026-03-12T10:00:00.000Z",
      stats: { orderCount: 2, spentMxn: 55_000, lastOrderAt: null },
    });
    expect(customer).toMatchObject({ orderCount: 2, spentMxn: 55_000, lastOrderAt: null });
    expect(customerFullName(customer)).toBe("Ana Pérez");
  });
});
