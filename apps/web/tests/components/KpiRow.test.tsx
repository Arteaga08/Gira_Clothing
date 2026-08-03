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
  totalMxnEquivalent: 4_162_700,
  unitsSold: 68,
};

const baseInventory = { unitsAvailable: 394 };

describe("KpiRow", () => {
  it("renderiza los tres KPIs, con Ingresos combinado en una sola tarjeta", () => {
    render(<KpiRow orders={baseOrders} inventory={baseInventory} />);
    expect(screen.getByText("Pedidos")).toBeInTheDocument();
    expect(screen.getByText("47")).toBeInTheDocument();
    expect(screen.getByText("Ingresos (equiv. MXN)")).toBeInTheDocument();
    expect(screen.queryByText("Ingresos MXN")).not.toBeInTheDocument();
    expect(screen.queryByText("Ingresos USD")).not.toBeInTheDocument();
    expect(screen.getByText("Unidades vendidas")).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
  });

  it("el valor acentuado es el equivalente en MXN, no solo el real", () => {
    render(<KpiRow orders={baseOrders} inventory={baseInventory} />);
    // 4,162,700 centavos -> $41,627
    expect(screen.getByText("$41,627")).toBeInTheDocument();
  });

  it("el renglón secundario de USD solo aparece si hay pedidos en USD", () => {
    render(<KpiRow orders={baseOrders} inventory={baseInventory} />);
    expect(screen.getByText(/USD/)).toBeInTheDocument();
    expect(screen.getByText(/3 pedidos/)).toBeInTheDocument();
  });

  it("sin pedidos en USD, no muestra el renglón secundario", () => {
    render(
      <KpiRow
        orders={{ ...baseOrders, revenue: [baseOrders.revenue[0]!], totalMxnEquivalent: 3_417_500 }}
        inventory={baseInventory}
      />,
    );
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it("incluye la nota de que el equivalente usa la tasa congelada de cada pedido", () => {
    render(<KpiRow orders={baseOrders} inventory={baseInventory} />);
    expect(screen.getByText(/tasa de cambio/)).toBeInTheDocument();
  });
});
