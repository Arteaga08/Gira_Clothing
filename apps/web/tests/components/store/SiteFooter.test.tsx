import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooterView } from "@/components/store/footer/SiteFooterView";
import { buildFooterColumns } from "@/lib/store/footerLinks";

const columns = buildFooterColumns([{ name: "Playeras", slug: "playeras" }]);

describe("SiteFooterView", () => {
  it("pinta las columnas abiertas con su navegación y el acordeón con los mismos enlaces", () => {
    const { container } = render(<SiteFooterView columns={columns} networks={[]} year={2026} />);
    const shop = screen.getByRole("navigation", { name: "Tienda" });
    expect(within(shop).getByRole("link", { name: "Playeras" })).toHaveAttribute("href", "/tienda?categoria=playeras");
    expect(screen.getByRole("navigation", { name: "Legal" })).toBeInTheDocument();
    const summaries = [...container.querySelectorAll("details > summary")].map((summary) => summary.textContent);
    expect(summaries).toEqual(["Tienda", "Ayuda", "Cuenta", "Legal"]);
  });

  it("muestra los créditos y, sin redes con enlace, ningún icono de red", () => {
    render(<SiteFooterView columns={columns} networks={[]} year={2026} />);
    expect(screen.getByText("© 2026 Gira Clothing")).toBeInTheDocument();
    expect(screen.getByText("Desarrollado por Vidix Studio")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /se abre en otra pestaña/ })).not.toBeInTheDocument();
  });

  it("cada red con enlace abre en otra pestaña con rel seguro", () => {
    render(
      <SiteFooterView
        columns={columns}
        networks={[{ key: "instagram", label: "Instagram", href: "https://instagram.com/gira" }]}
        year={2026}
      />,
    );
    const link = screen.getByRole("link", { name: "Instagram (se abre en otra pestaña)" });
    expect(link).toHaveAttribute("href", "https://instagram.com/gira");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
