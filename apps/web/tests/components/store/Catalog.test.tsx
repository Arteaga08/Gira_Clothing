import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CatalogBanner } from "@/components/store/catalog/CatalogBanner";
import { CatalogCategories } from "@/components/store/catalog/CatalogCategories";
import { CatalogMessage } from "@/components/store/catalog/CatalogMessage";
import { CatalogPager } from "@/components/store/catalog/CatalogPager";
import { CatalogSort } from "@/components/store/catalog/CatalogSort";
import type { PublicCategorySummary } from "@/lib/api/storefront";
import { parseCatalogQuery } from "@/lib/store/catalogQuery";

const category = (overrides: Partial<PublicCategorySummary> = {}): PublicCategorySummary => ({
  id: "c1",
  name: "Playeras",
  slug: "playeras",
  description: "Playeras de algodón con estampa al frente.",
  color: "lilac",
  ...overrides,
});

const CATEGORIES = [category(), category({ id: "c2", name: "Gorras", slug: "gorras", color: "pink" })];

describe("CatalogBanner", () => {
  it("sin categoría presenta todo el catálogo; es el único h1", () => {
    render(<CatalogBanner />);
    expect(screen.getByRole("heading", { level: 1, name: "Todo lo que trae la gira" })).toBeInTheDocument();
  });

  it("con categoría muestra su nombre y descripción, en su color", () => {
    const { container } = render(<CatalogBanner category={category()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Playeras" })).toBeInTheDocument();
    expect(screen.getByText("Playeras de algodón con estampa al frente.")).toBeInTheDocument();
    expect(container.querySelector(".bg-cat-lilac")).not.toBeNull();
  });

  it("una categoría hueso toma menta: el banner nunca es blanco", () => {
    const { container } = render(<CatalogBanner category={category({ color: "bone" })} />);
    expect(container.querySelector(".bg-cat-bone")).toBeNull();
    expect(container.querySelector(".bg-cat-mint")).not.toBeNull();
  });

  it("pinta la foto de la categoría solo si existe", () => {
    const image = { url: "https://res.cloudinary.com/gira/image/upload/v1/playeras.jpg", width: 1600, height: 900 };
    const { container, rerender } = render(<CatalogBanner category={category({ image })} />);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    rerender(<CatalogBanner category={category()} />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("solo novedades: lo dice en el título", () => {
    render(<CatalogBanner newArrivalsOnly />);
    expect(screen.getByRole("heading", { level: 1, name: "Novedades" })).toBeInTheDocument();
  });
});

describe("CatalogCategories", () => {
  it("«Todo» está marcado sin categoría y cada tile enlaza a su filtro", () => {
    render(<CatalogCategories categories={CATEGORIES} query={parseCatalogQuery({})} />);
    const nav = screen.getByRole("navigation", { name: "Categorías" });
    expect(within(nav).getByRole("link", { name: "Todo" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "Playeras" })).toHaveAttribute("href", "/tienda?categoria=playeras");
    expect(within(nav).getByRole("link", { name: "Playeras" })).not.toHaveAttribute("aria-current");
  });

  it("marca la categoría elegida; cambiarla vuelve a la página 1 y conserva el orden", () => {
    render(<CatalogCategories categories={CATEGORIES} query={parseCatalogQuery({ categoria: "playeras", orden: "az", pagina: "3" })} />);
    expect(screen.getByRole("link", { name: "Playeras" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Gorras" })).toHaveAttribute("href", "/tienda?categoria=gorras&orden=az");
    expect(screen.getByRole("link", { name: "Todo" })).toHaveAttribute("href", "/tienda?orden=az");
  });
});

describe("CatalogSort", () => {
  it("cerrado muestra el orden actual y el total; las opciones no se pueden tabular", () => {
    render(<CatalogSort query={parseCatalogQuery({ orden: "precio-asc" })} total={10} />);
    const toggle = screen.getByRole("button", { name: /Ordenar por/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Precio: menor a mayor");
    expect(toggle).toHaveTextContent("10 prendas");
    expect(screen.getByRole("link", { name: "A a Z", hidden: true }).closest("[inert]")).not.toBeNull();
  });

  it("abre con el botón y lista los cinco órdenes como enlaces", async () => {
    render(<CatalogSort query={parseCatalogQuery({ categoria: "gorras" })} total={1} />);
    const toggle = screen.getByRole("button", { name: /Ordenar por/ });
    expect(toggle).toHaveTextContent("1 prenda");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Novedades" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Z a A" })).toHaveAttribute("href", "/tienda?categoria=gorras&orden=za");
  });

  it("elegir un orden cierra el acordeón", async () => {
    document.addEventListener("click", (event) => event.preventDefault(), { once: true, capture: false });
    render(<CatalogSort query={parseCatalogQuery({})} total={4} />);
    await userEvent.click(screen.getByRole("button", { name: /Ordenar por/ }));
    await userEvent.click(screen.getByRole("link", { name: "A a Z" }));
    expect(screen.getByRole("button", { name: /Ordenar por/ })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("CatalogPager", () => {
  it("no se dibuja con una sola página", () => {
    const { container } = render(<CatalogPager query={parseCatalogQuery({})} pages={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("marca la página actual y enlaza a las demás conservando los filtros", () => {
    render(<CatalogPager query={parseCatalogQuery({ categoria: "gorras", pagina: "2" })} pages={3} />);
    expect(screen.getByRole("link", { name: "Página 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Página 3" })).toHaveAttribute("href", "/tienda?categoria=gorras&pagina=3");
    expect(screen.getByRole("link", { name: "Página 1" })).toHaveAttribute("href", "/tienda?categoria=gorras");
    expect(screen.getByRole("link", { name: "Página anterior" })).toHaveAttribute("href", "/tienda?categoria=gorras");
    expect(screen.getByRole("link", { name: "Página siguiente" })).toHaveAttribute("href", "/tienda?categoria=gorras&pagina=3");
  });

  it("cada número tiene un color distinto (ninguno se funde con el fondo verde)", () => {
    render(<CatalogPager query={parseCatalogQuery({})} pages={5} />);
    const fills = [1, 2, 3, 4, 5].map((page) => {
      const link = screen.getByRole("link", { name: `Página ${page}` });
      return [...link.classList].find((name) => name.startsWith("bg-cat-"));
    });
    expect(fills.every(Boolean)).toBe(true);
    expect(new Set(fills).size).toBe(5);
  });

  it("en los extremos la flecha no es un enlace", () => {
    render(<CatalogPager query={parseCatalogQuery({})} pages={2} />);
    expect(screen.queryByRole("link", { name: "Página anterior" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Página siguiente" })).toBeInTheDocument();
  });
});

describe("CatalogMessage", () => {
  it("vacío con filtros: ofrece volver a todo el catálogo", () => {
    render(<CatalogMessage variant="empty" href="/tienda" filtered />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todo el catálogo" })).toHaveAttribute("href", "/tienda");
  });

  it("vacío sin filtros: la colección está en preparación y no hay botón", () => {
    render(<CatalogMessage variant="empty" href="/tienda" />);
    expect(screen.getByText("Estamos preparando la colección")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("error: avisa y ofrece reintentar en la misma dirección", () => {
    render(<CatalogMessage variant="error" href="/tienda?categoria=gorras" />);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar el catálogo");
    expect(screen.getByRole("link", { name: "Reintentar" })).toHaveAttribute("href", "/tienda?categoria=gorras");
  });
});
