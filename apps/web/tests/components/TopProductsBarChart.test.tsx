import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopProductsBarChart } from "@/components/resumen/TopProductsBarChart";

const product = (sku: string, productName: string, units: number) => ({
  sku,
  productName,
  printName: "Amapolas",
  units,
});

describe("TopProductsBarChart", () => {
  it("renderiza exactamente una barra por producto", () => {
    const products = [product("A", "Tote", 4), product("B", "Gorra", 8), product("C", "Playera", 1)];
    render(<TopProductsBarChart products={products} />);
    expect(document.querySelectorAll("[data-bar]")).toHaveLength(3);
  });

  it('el contenedor es role="img" con aria-label describiendo el total', () => {
    const products = [product("A", "Tote", 4), product("B", "Gorra", 8)];
    render(<TopProductsBarChart products={products} />);
    const chart = screen.getByRole("img");
    expect(chart.getAttribute("aria-label")).toMatch(/total 12/i);
    expect(chart.getAttribute("aria-label")).toMatch(/máximo 8/i);
  });

  it("sin unidades (todo en cero) no produce NaN en ningún style", () => {
    const products = [product("A", "Tote", 0), product("B", "Gorra", 0)];
    render(<TopProductsBarChart products={products} />);
    document.querySelectorAll("[data-bar]").forEach((bar) => {
      expect((bar as HTMLElement).style.height).not.toMatch(/NaN/);
    });
  });

  it("muestra el nombre del producto debajo de cada barra", () => {
    const products = [product("A", "Tote de lona", 4)];
    render(<TopProductsBarChart products={products} />);
    expect(screen.getByText("Tote de lona")).toBeInTheDocument();
  });
});
