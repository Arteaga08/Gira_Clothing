import { Currency } from "@gira/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiRow } from "@/components/resumen/KpiRow";

const baseOrders = {
  totalOrders: 47,
  paidOrders: 39,
  revenue: [
    { currency: Currency.MXN, revenue: 3_417_500, orders: 36, averageTicket: 94_931 },
    { currency: Currency.USD, revenue: 41_400, orders: 3, averageTicket: 13_800 },
  ],
  unitsSold: 68,
};

const baseInventory = { unitsAvailable: 394 };

describe("KpiRow", () => {
  it("renderiza los cuatro KPIs con sus valores", () => {
    render(<KpiRow orders={baseOrders} inventory={baseInventory} />);
    expect(screen.getByText("Pedidos")).toBeInTheDocument();
    expect(screen.getByText("47")).toBeInTheDocument();
    expect(screen.getByText("Ingresos MXN")).toBeInTheDocument();
    expect(screen.getByText("Ingresos USD")).toBeInTheDocument();
    expect(screen.getByText("Unidades vendidas")).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
  });

  it("una moneda ausente en revenue[] se renderiza en cero, no se oculta", () => {
    render(
      <KpiRow
        orders={{ ...baseOrders, revenue: [baseOrders.revenue[0]!] }}
        inventory={baseInventory}
      />,
    );
    expect(screen.getByText("Ingresos USD")).toBeInTheDocument();
  });

  it("incluye la nota de que MXN y USD nunca se suman", () => {
    render(<KpiRow orders={baseOrders} inventory={baseInventory} />);
    expect(
      screen.getByText(/MXN y USD nunca se suman/),
    ).toBeInTheDocument();
  });
});
