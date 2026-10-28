import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountNav } from "@/components/store/account/shell/AccountNav";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/cuenta" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

describe("AccountNav", () => {
  it("en /cuenta solo «Resumen» está activo", () => {
    pathname.value = "/cuenta";
    render(<AccountNav />);
    expect(screen.getByRole("link", { name: "Resumen" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Mis pedidos" })).not.toHaveAttribute("aria-current");
  });

  it("en el detalle de un pedido «Mis pedidos» sigue activo y «Resumen» no", () => {
    pathname.value = "/cuenta/pedidos/68f2ab12c3d4e5f6a7b8c9d0";
    render(<AccountNav />);
    expect(screen.getByRole("link", { name: "Mis pedidos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Resumen" })).not.toHaveAttribute("aria-current");
  });

  it("Direcciones y Facturación aparecen desactivadas, sin enlace", () => {
    pathname.value = "/cuenta";
    render(<AccountNav />);
    expect(screen.queryByRole("link", { name: /Direcciones/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Facturación/ })).toBeNull();
    expect(screen.getByText("Direcciones").closest("[aria-disabled='true']")).not.toBeNull();
    expect(screen.getAllByText("Próximamente")).toHaveLength(2);
  });

  it("enlaza Perfil y Guardados", () => {
    render(<AccountNav />);
    expect(screen.getByRole("link", { name: "Perfil" })).toHaveAttribute("href", "/cuenta/perfil");
    expect(screen.getByRole("link", { name: "Guardados" })).toHaveAttribute("href", "/cuenta/guardados");
  });
});
