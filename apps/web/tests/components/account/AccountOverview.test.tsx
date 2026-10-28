import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountDetailsPanel } from "@/components/store/account/overview/AccountDetailsPanel";
import { AccountTiles } from "@/components/store/account/overview/AccountTiles";
import { addressesSummary, billingSummary, savedSummary } from "@/lib/account/overviewSummaries";

vi.mock("@/components/store/account/shell/LogoutButton", () => ({ LogoutButton: () => <button type="button">Cerrar sesión</button> }));

describe("AccountDetailsPanel", () => {
  it("sin direcciones no dibuja la fila", () => {
    render(<AccountDetailsPanel firstName="María" lastName="López" email="m@correo.mx" />);
    expect(screen.queryByText("Direcciones")).toBeNull();
  });

  it("con direcciones muestra el conteo real", () => {
    render(<AccountDetailsPanel firstName="María" lastName="López" email="m@correo.mx" addressCount={2} />);
    expect(screen.getByText("Direcciones")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("AccountTiles", () => {
  it("todas las secciones son enlaces con su resumen, sin «Próximamente»", () => {
    render(<AccountTiles summaries={{ orders: "3 pedidos", addresses: "2 direcciones", billing: "Sin agregar", saved: "5 prendas" }} />);
    expect(screen.getByRole("link", { name: /Direcciones/ })).toHaveAttribute("href", "/cuenta/direcciones");
    expect(screen.getByRole("link", { name: /Facturación/ })).toHaveAttribute("href", "/cuenta/facturacion");
    expect(screen.getByText("2 direcciones")).toBeInTheDocument();
    expect(screen.getByText("5 prendas")).toBeInTheDocument();
    expect(screen.queryByText("Próximamente")).toBeNull();
  });
});

describe("overviewSummaries", () => {
  it("direcciones, facturación y guardados en singular, plural y vacío", () => {
    expect([addressesSummary(0), addressesSummary(1), addressesSummary(2)]).toEqual(["Sin agregar", "1 dirección", "2 direcciones"]);
    expect([savedSummary(0), savedSummary(1), savedSummary(5)]).toEqual(["Sin guardados", "1 prenda", "5 prendas"]);
    expect(billingSummary(null)).toBe("Sin agregar");
    expect(billingSummary({ rfc: "LOMM910312AB1", legalName: "x", fiscalRegime: "612", cfdiUse: "G03", postalCode: "06000" })).toBe("LOMM910312AB1");
  });
});
