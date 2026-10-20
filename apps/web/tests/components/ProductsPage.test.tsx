import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductsPage } from "@/components/catalog/ProductsPage";
import { ApiError } from "@/lib/api/ApiError";
import { parseCatalogFilters } from "@/lib/catalog/filters";
import { toPanelProduct, type PanelProduct } from "@/lib/catalog/panelProduct";
import { makeRawProduct } from "../helpers/catalog";

const products = vi.hoisted(() => ({ listProducts: vi.fn() }));
vi.mock("@/lib/api/adminProducts", () => products);
const catalog = vi.hoisted(() => ({ fetchCategoryOptions: vi.fn() }));
vi.mock("@/lib/api/adminCatalog", () => catalog);

const { replaceMock, pushMock } = vi.hoisted(() => ({ replaceMock: vi.fn(), pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/productos",
  useRouter: () => ({ replace: replaceMock, push: pushMock, refresh: vi.fn() }),
}));

const COSMETIQUERA = "aaaaaaaaaaaaaaaaaaaaaaa1";
const PLAYERAS = "bbbbbbbbbbbbbbbbbbbbbbb2";

const product = (id: string, name: string, categoryId: string, categoryName: string, overrides = {}): PanelProduct =>
  toPanelProduct(
    makeRawProduct({ id, name, category: { id: categoryId, name: categoryName, slug: "x" }, ...overrides }),
  );

const CHICA = product("111111111111111111111111", "Cosmetiquera chica", COSMETIQUERA, "Cosmetiquera");
const GRANDE = product("222222222222222222222222", "Cosmetiquera grande", COSMETIQUERA, "Cosmetiquera", { basePrice: 24900 });
const OVERSIZE = product("333333333333333333333333", "Playera oversize", PLAYERAS, "Playeras", { isActive: false });

const page = (items: PanelProduct[]) => ({
  products: items,
  meta: { total: items.length, page: 1, pages: 1, limit: 100 },
});

const renderPage = (params: Record<string, string> = {}) =>
  render(<ProductsPage initialFilters={parseCatalogFilters(params)} />);

beforeEach(() => {
  products.listProducts.mockReset().mockResolvedValue(page([CHICA, GRANDE, OVERSIZE]));
  catalog.fetchCategoryOptions.mockReset().mockResolvedValue([
    { value: COSMETIQUERA, label: "Cosmetiquera" },
    { value: PLAYERAS, label: "Playeras" },
  ]);
  replaceMock.mockReset();
  pushMock.mockReset();
});

describe("ProductsPage", () => {
  it("agrupa las tarjetas por categoría y enlaza cada una a su editor", async () => {
    renderPage();
    const cosmetiquera = await screen.findByRole("region", { name: "Cosmetiquera" });
    expect(within(cosmetiquera).getAllByRole("link")).toHaveLength(2);
    const link = within(cosmetiquera).getByRole("link", { name: /Cosmetiquera chica/ });
    expect(link).toHaveAttribute("href", "/productos/111111111111111111111111");
    expect(within(cosmetiquera).getByText("$189.00")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Playeras" })).toBeInTheDocument();
  });

  it("un modelo retirado se marca como tal", async () => {
    renderPage({ estado: "todos" });
    const playeras = await screen.findByRole("region", { name: "Playeras" });
    expect(within(playeras).getByText("Retirado")).toBeInTheDocument();
  });

  it("pide al API lo que dicen los filtros de la URL", async () => {
    renderPage({ categoria: COSMETIQUERA, estado: "retirados", q: "tote", orden: "-basePrice" });
    await screen.findByRole("region", { name: "Cosmetiquera" });
    const query = new URLSearchParams(products.listProducts.mock.calls[0]?.[0] as string);
    expect(query.get("category")).toBe(COSMETIQUERA);
    expect(query.get("isActive")).toBe("false");
    expect(query.get("search")).toBe("tote");
    expect(query.get("sort")).toBe("-basePrice");
  });

  it("cambiar un filtro escribe la URL en español y vuelve a la página 1", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Cosmetiquera" });
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "retired");
    expect(replaceMock).toHaveBeenCalledWith("/productos?estado=retirados", { scroll: false });
    await userEvent.selectOptions(screen.getByLabelText("Ordenar por"), "name");
    expect(replaceMock).toHaveBeenLastCalledWith("/productos?estado=retirados&orden=name", { scroll: false });
  });

  it("la búsqueda espera a que se deje de escribir", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Cosmetiquera" });
    await userEvent.type(screen.getByLabelText("Buscar"), "tote");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/productos?q=tote", { scroll: false }));
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it("muestra el esqueleto mientras carga", () => {
    products.listProducts.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("sin modelos y sin filtros invita a crear el primero", async () => {
    products.listProducts.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText("Todavía no hay modelos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nuevo producto/ })).toHaveAttribute("href", "/productos/nuevo");
  });

  it("sin resultados con filtros ofrece limpiarlos", async () => {
    products.listProducts.mockResolvedValue(page([]));
    renderPage({ q: "zzz", orden: "name" });
    expect(await screen.findByText("Ningún modelo coincide")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(replaceMock).toHaveBeenCalledWith("/productos", { scroll: false });
  });

  it("un error de carga muestra el mensaje y Reintentar vuelve a pedir", async () => {
    products.listProducts.mockRejectedValueOnce(new ApiError("No hay conexión con el servidor.", "network"));
    renderPage();
    expect(await screen.findByText("No hay conexión con el servidor.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("region", { name: "Cosmetiquera" })).toBeInTheDocument();
    expect(products.listProducts).toHaveBeenCalledTimes(2);
  });

  it("solo hay un botón principal en la pantalla: el de la cabecera vive en la página, no aquí", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Cosmetiquera" });
    expect(screen.queryByRole("link", { name: /Nuevo producto/ })).not.toBeInTheDocument();
  });
});
