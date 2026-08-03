import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TopProductsSection } from "@/components/resumen/TopProductsSection";

const { fetchTopProductsForPeriodMock } = vi.hoisted(() => ({
  fetchTopProductsForPeriodMock: vi.fn(),
}));

vi.mock("@/lib/api/topProducts", () => ({
  fetchTopProductsForPeriod: fetchTopProductsForPeriodMock,
}));

const product = (sku: string, productName: string, units: number) => ({
  sku,
  productName,
  printName: "Amapolas",
  units,
});

describe("TopProductsSection — camino feliz", () => {
  it("renderiza los productos iniciales sin refetch al montar", () => {
    render(
      <TopProductsSection
        initialProducts={[product("A", "Tote", 4)]}
        initialPeriod="week"
      />,
    );

    expect(screen.getByText("Tote")).toBeInTheDocument();
    expect(fetchTopProductsForPeriodMock).not.toHaveBeenCalled();
  });

  it("con arreglo inicial vacío, EmptyState", () => {
    render(<TopProductsSection initialProducts={[]} initialPeriod="week" />);
    expect(screen.getByText(/Sin ventas en este periodo/)).toBeInTheDocument();
  });
});

describe("TopProductsSection — cambio de periodo", () => {
  it("clic en Hoy refetchea y reemplaza la lista", async () => {
    fetchTopProductsForPeriodMock.mockResolvedValue({
      period: "today",
      range: { from: "2026-08-03T06:00:00.000Z", to: "2026-08-03T20:00:00.000Z" },
      products: [product("B", "Gorra", 9)],
    });
    const user = userEvent.setup();
    render(<TopProductsSection initialProducts={[product("A", "Tote", 4)]} initialPeriod="week" />);

    await user.click(screen.getByRole("button", { name: "Hoy" }));

    await waitFor(() => expect(screen.getByText("Gorra")).toBeInTheDocument());
    expect(fetchTopProductsForPeriodMock).toHaveBeenCalledWith("today", undefined);
    expect(screen.queryByText("Tote")).not.toBeInTheDocument();
  });

  it("un refetch fallido muestra un aviso, sin tirar la sección completa", async () => {
    fetchTopProductsForPeriodMock.mockRejectedValue(new Error("caído"));
    const user = userEvent.setup();
    render(<TopProductsSection initialProducts={[product("A", "Tote", 4)]} initialPeriod="week" />);

    await user.click(screen.getByRole("button", { name: "Mes" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
