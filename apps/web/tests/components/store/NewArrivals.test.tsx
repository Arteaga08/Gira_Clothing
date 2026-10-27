import { render, screen, within } from "@testing-library/react";
import type { PublicProductSummary } from "@gira/shared";
import { describe, expect, it, vi } from "vitest";
import { NewArrivalsBento } from "@/components/store/new-arrivals/NewArrivalsBento";

vi.mock("@/lib/api/cart", () => ({ addToAccountCart: vi.fn() }));

const IMAGE = { url: "https://res.cloudinary.com/gira/image/upload/v1/uno.jpg", publicId: "uno", width: 800, height: 600 };

const product = (id: string, overrides: Partial<PublicProductSummary> = {}): PublicProductSummary => ({
  id,
  name: `Prenda ${id}`,
  slug: `prenda-${id}`,
  category: { id: "c1", name: "Sudaderas", slug: "sudaderas", color: "tangerine" },
  measurements: {},
  materials: [],
  bestSeller: false,
  newArrival: true,
  cardTags: ["Felpa", "Holgada"],
  card: { variantId: `v-${id}`, images: [IMAGE], price: 79900, isAvailable: true },
  ...overrides,
});

const renderBento = (products: PublicProductSummary[]) =>
  render(<NewArrivalsBento products={products} authenticated={false} />);

describe("NewArrivalsBento", () => {
  it("titula la sección y enlaza a todas las novedades", () => {
    renderBento([product("1")]);
    expect(screen.getByRole("region", { name: "Recién salido" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todas las novedades" })).toHaveAttribute("href", "/tienda?novedad=si");
  });

  it("la primera es la grande: estrella y palabras de la card; las demás solo nombre, precio y carrito", () => {
    const { container } = renderBento([product("1"), product("2")]);
    const [lead, other] = Array.from(container.querySelectorAll("article"));
    expect(lead).toHaveAttribute("data-lead", "true");
    expect(within(lead!).getByText("¡Nuevo!")).toBeInTheDocument();
    expect(within(lead!).getByText("Felpa, Holgada")).toBeInTheDocument();
    expect(lead!.querySelector("img")?.getAttribute("src")).toContain("w_1080");
    expect(other).toHaveAttribute("data-lead", "false");
    expect(within(other!).queryByText("¡Nuevo!")).not.toBeInTheDocument();
    expect(within(other!).queryByText("Felpa, Holgada")).not.toBeInTheDocument();
    expect(within(other!).getByRole("heading", { name: "Prenda 2" })).toBeInTheDocument();
    expect(within(other!).getByText("$799.00")).toBeInTheDocument();
    expect(within(other!).getByRole("button", { name: "Agregar Prenda 2 al carrito" })).toBeInTheDocument();
  });

  it("la foto lleva al producto y la etiqueta toma el color de la categoría", () => {
    const { container } = renderBento([product("1")]);
    expect(screen.getByRole("link", { name: "Ver Prenda 1" })).toHaveAttribute("href", "/tienda/prenda-1");
    expect(container.querySelector(".new-tag")).toHaveClass("bg-cat-tangerine");
  });

  it("el bento sabe cuántas hay para acomodarse sin huecos", () => {
    const { container } = renderBento([product("1"), product("2"), product("3")]);
    expect(container.querySelector(".new-bento")).toHaveAttribute("data-count", "3");
  });

  it("agotada: el botón lo dice y no se puede pulsar", () => {
    renderBento([product("1", { card: { variantId: "v", images: [], price: 1, isAvailable: false } })]);
    expect(screen.getByRole("button", { name: "Prenda 1, agotado" })).toBeDisabled();
  });
});
