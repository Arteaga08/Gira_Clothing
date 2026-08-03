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
  it("renderiza los tres KPIs, con Ingresos en una sola tarjeta", () => {
    render(<KpiRow orders={baseOrders} inventory={baseInventory} />);
    expect(screen.getByText("Pedidos")).toBeInTheDocument();
    expect(screen.getByText("47")).toBeInTheDocument();
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
    expect(screen.getByText("Unidades vendidas")).toBeInTheDocument();
    expect(screen.getByText("68")).toBeInTheDocument();
  });

  it("el valor es el equivalente en pesos, aunque haya pedidos en otra moneda", () => {
    render(<KpiRow orders={baseOrders} inventory={baseInventory} />);
    // 4,162,700 centavos -> $41,627
    expect(screen.getByText("$41,627")).toBeInTheDocument();
  });

  it('la tarjeta de ingresos nunca menciona "USD", ni siquiera con pedidos en esa moneda', () => {
    render(<KpiRow orders={baseOrders} inventory={baseInventory} />);
    const card = screen.getByText("Ingresos").closest("div");
    expect(card).not.toHaveTextContent("USD");
  });

  it("el pie de la tarjeta cuenta todos los pedidos con ingreso, sin desglosar por moneda", () => {
    render(<KpiRow orders={baseOrders} inventory={baseInventory} />);
    // 36 MXN + 3 USD = 39 pedidos con ingreso, mostrados como un solo número.
    expect(screen.getByText("39 pedidos")).toBeInTheDocument();
  });

  it("una moneda ausente en revenue[] no rompe nada, sigue mostrando el equivalente", () => {
    render(
      <KpiRow
        orders={{ ...baseOrders, revenue: [baseOrders.revenue[0]!], totalMxnEquivalent: 3_417_500 }}
        inventory={baseInventory}
      />,
    );
    expect(screen.getByText("$34,175")).toBeInTheDocument();
    expect(screen.getByText("36 pedidos")).toBeInTheDocument();
  });

  it("la nota debajo del grupo de KPIs no menciona USD, solo explica la conversión", () => {
    render(<KpiRow orders={baseOrders} inventory={baseInventory} />);
    const note = screen.getByText(/se convierte/);
    expect(note).toBeInTheDocument();
    expect(note).not.toHaveTextContent("USD");
  });
});
