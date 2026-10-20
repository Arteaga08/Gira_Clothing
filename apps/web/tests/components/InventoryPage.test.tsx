import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryPage } from "@/components/inventory/InventoryPage";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { parseInventoryFilters } from "@/lib/inventory/filters";
import { toPanelVariant, type PanelVariant } from "@/lib/inventory/panelVariant";
import { makeRawVariant } from "../helpers/inventory";

const api = vi.hoisted(() => ({
  listVariants: vi.fn(),
  fetchInventoryCounts: vi.fn(),
  updateStock: vi.fn(),
  getVariantActivity: vi.fn(),
}));
vi.mock("@/lib/api/adminVariants", () => api);

const catalog = vi.hoisted(() => ({ fetchInventoryFilterOptions: vi.fn() }));
vi.mock("@/lib/api/adminCatalogOptions", () => catalog);

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/inventario",
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
}));

const HOODIES = "aaaaaaaaaaaaaaaaaaaaaaa1";
const PLAYERAS = "bbbbbbbbbbbbbbbbbbbbbbb2";

const variant = (
  id: string,
  sku: string,
  categoryId: string,
  categoryName: string,
  onHand: number,
  reserved = 0,
): PanelVariant => {
  const raw = makeRawVariant({ id, sku, onHand, reserved, available: onHand - reserved });
  return toPanelVariant({
    ...raw,
    product: { ...raw.product, name: `Modelo ${sku}`, category: { ...raw.product.category, id: categoryId, name: categoryName } },
  });
};

const OUT = variant("111111111111111111111111", "HOOD-OUT", HOODIES, "Hoodies", 2, 2);
const LOW = variant("222222222222222222222222", "HOOD-LOW", HOODIES, "Hoodies", 3);
const OK = variant("333333333333333333333333", "TEE-OK", PLAYERAS, "Playeras", 20, 1);
const COUNTS = { threshold: 3, total: 3, out: 1, low: 1, ok: 1 };

const page = (variants: PanelVariant[]) => ({
  variants,
  meta: { total: variants.length, page: 1, pages: 1, limit: 100 },
});

const stubDesktop = (matches: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as never;
};

const element = (params: Record<string, string> = {}, counts: typeof COUNTS | null = COUNTS) => (
  <ToastProvider>
    <InventoryPage initialFilters={parseInventoryFilters(params)} initialCounts={counts} />
  </ToastProvider>
);
const renderPage = (params: Record<string, string> = {}) => render(element(params));

const toggleOf = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  stubDesktop(true);
  Object.values(api).forEach((mock) => mock.mockReset());
  catalog.fetchInventoryFilterOptions.mockReset().mockResolvedValue({ categories: [], models: [], prints: [] });
  replaceMock.mockReset();
  api.listVariants.mockResolvedValue(page([OUT, LOW, OK]));
  api.fetchInventoryCounts.mockResolvedValue(COUNTS);
  api.getVariantActivity.mockResolvedValue([]);
});

describe("InventoryPage: categorías", () => {
  it("las categorías arrancan cerradas, con su resumen y sin filas", async () => {
    renderPage();
    const hoodies = await screen.findByRole("button", { name: /^Hoodies/ });
    expect(hoodies).toHaveAttribute("aria-expanded", "false");
    expect(toggleOf("Playeras")).toHaveAttribute("aria-expanded", "false");
    expect(within(hoodies).getByText("2 variantes")).toBeInTheDocument();
    expect(within(hoodies).getByText("1 agotado")).toBeInTheDocument();
    expect(within(hoodies).getByText("1 bajo")).toBeInTheDocument();
    expect(screen.queryByText("HOOD-OUT")).not.toBeInTheDocument();
    expect(screen.queryByText("TEE-OK")).not.toBeInTheDocument();
  });

  it("el botón de flecha abre y cierra la categoría", async () => {
    renderPage();
    const hoodies = await screen.findByRole("button", { name: /^Hoodies/ });
    await userEvent.click(hoodies);
    expect(hoodies).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("HOOD-OUT")).toBeInTheDocument();
    expect(screen.getByText("HOOD-LOW")).toBeInTheDocument();
    expect(screen.queryByText("TEE-OK")).not.toBeInTheDocument();
    await userEvent.click(hoodies);
    expect(hoodies).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("HOOD-OUT")).not.toBeInTheDocument();
  });

  it("se abre y se cierra con el teclado", async () => {
    renderPage();
    const hoodies = await screen.findByRole("button", { name: /^Hoodies/ });
    hoodies.focus();
    await userEvent.keyboard("{Enter}");
    expect(hoodies).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard(" ");
    expect(hoodies).toHaveAttribute("aria-expanded", "false");
  });

  it("dentro de la categoría lo más urgente va arriba", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Hoodies/ }));
    const rows = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
    expect(rows[0]).toContain("HOOD-OUT");
    expect(rows[1]).toContain("HOOD-LOW");
  });

  it("una búsqueda abre solas las categorías con coincidencias, y se pueden cerrar a mano", async () => {
    renderPage({ q: "hood" });
    const hoodies = await screen.findByRole("button", { name: /^Hoodies/ });
    expect(hoodies).toHaveAttribute("aria-expanded", "true");
    expect(toggleOf("Playeras")).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(hoodies);
    expect(hoodies).toHaveAttribute("aria-expanded", "false");
  });

  it.each([["estado", "bajo"], ["modelo", "444444444444444444444444"], ["print", "555555555555555555555555"]])(
    "el filtro %s también las abre solas",
    async (key, value) => {
      renderPage({ [key]: value });
      expect(await screen.findByRole("button", { name: /^Hoodies/ })).toHaveAttribute("aria-expanded", "true");
    },
  );

  it("cerrar una categoría no pierde la variante seleccionada", async () => {
    renderPage();
    const hoodies = await screen.findByRole("button", { name: /^Hoodies/ });
    await userEvent.click(hoodies);
    await userEvent.click(screen.getByRole("button", { name: /HOOD-LOW/ }));
    const aside = screen.getByRole("complementary", { name: /Vista previa/ });
    expect(within(aside).getByText("HOOD-LOW")).toBeInTheDocument();
    await userEvent.click(hoodies);
    expect(screen.queryByRole("button", { name: /HOOD-LOW/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: /Vista previa/ })).getByText("HOOD-LOW")).toBeInTheDocument();
  });
});

describe("InventoryPage: pestañas, estados y URL", () => {
  it("muestra los conteos y cambiar de pestaña pide ese estado y actualiza la URL", async () => {
    renderPage();
    await screen.findByRole("button", { name: /^Hoodies/ });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Agotado1", "Stock bajo1", "OK1", "Todos3"]);
    expect(screen.getByRole("tab", { name: /Todos/ })).toHaveAttribute("aria-selected", "true");

    api.listVariants.mockResolvedValue(page([OUT]));
    await userEvent.click(screen.getByRole("tab", { name: /Agotado/ }));

    await waitFor(() => expect(api.listVariants).toHaveBeenLastCalledWith(expect.stringContaining("stock=out")));
    expect(replaceMock).toHaveBeenCalledWith("/inventario?estado=agotado", { scroll: false });
  });

  it("siempre pide solo variantes activas y ordena por lo más urgente", async () => {
    renderPage();
    await screen.findByRole("button", { name: /^Hoodies/ });
    const query = String(api.listVariants.mock.calls[0]?.[0]);
    expect(query).toContain("isActive=true");
    expect(query).toContain("sort=available");
  });

  it("muestra el esqueleto mientras carga", () => {
    api.listVariants.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("sin variantes y sin filtros dice que el catálogo no tiene", async () => {
    api.listVariants.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText("Aún no hay variantes")).toBeInTheDocument();
  });

  it("con filtros dice que ninguna coincide; con solo la pestaña, que no hay de ese estado", async () => {
    api.listVariants.mockResolvedValue(page([]));
    const { unmount } = renderPage({ q: "zzz" });
    expect(await screen.findByText("Ninguna variante coincide")).toBeInTheDocument();
    unmount();
    renderPage({ estado: "agotado" });
    expect(await screen.findByText("Nada agotado")).toBeInTheDocument();
  });

  it("un error de carga muestra el aviso y Reintentar vuelve a pedir", async () => {
    api.listVariants.mockRejectedValueOnce(new ApiError("Sin conexión con el servidor.", "network"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión con el servidor.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: /^Hoodies/ })).toBeInTheDocument();
  });

  it("un refresco que falla deja las filas y avisa", async () => {
    renderPage();
    const hoodies = await screen.findByRole("button", { name: /^Hoodies/ });
    await userEvent.click(hoodies);
    api.listVariants.mockRejectedValue(new ApiError("Caído.", "network"));
    api.updateStock.mockResolvedValue({ ...LOW, onHand: 9, available: 9 });
    await userEvent.click(screen.getByRole("button", { name: /HOOD-LOW/ }));
    await userEvent.type(screen.getByLabelText("Hay en total"), "9");
    await userEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    expect(await screen.findByText("No se pudo actualizar la lista")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /HOOD-LOW/ })).toBeInTheDocument();
  });

  it("si la URL cambia desde fuera (atajo del Resumen), la lista se vuelve a pedir con ese filtro", async () => {
    const { rerender } = renderPage();
    await screen.findByRole("button", { name: /^Hoodies/ });
    api.listVariants.mockResolvedValue(page([OUT]));
    rerender(element({ estado: "agotado" }));
    await waitFor(() => expect(api.listVariants).toHaveBeenLastCalledWith(expect.stringContaining("stock=out")));
    expect(screen.getByRole("tab", { name: /Agotado/ })).toHaveAttribute("aria-selected", "true");
  });

  it("sin conteos del servidor los pide al montar", async () => {
    render(element({}, null));
    await waitFor(() => expect(api.fetchInventoryCounts).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("tab", { name: /Agotado/ })).toBeInTheDocument();
  });
});

describe("InventoryPage: ajustar stock", () => {
  const openLow = async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Hoodies/ }));
    await userEvent.click(screen.getByRole("button", { name: /HOOD-LOW/ }));
  };

  it("un ajuste exitoso manda el recuento con motivo, avisa con el SKU y refresca la lista y los conteos", async () => {
    api.updateStock.mockResolvedValue({ ...LOW, onHand: 12, available: 12 });
    await openLow();
    await userEvent.type(screen.getByLabelText("Hay en total"), "12");
    await userEvent.type(screen.getByLabelText("Motivo (opcional)"), "Llegó producción");
    const listCalls = api.listVariants.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));

    expect(api.updateStock).toHaveBeenCalledWith(LOW.id, { onHand: 12, reason: "Llegó producción" });
    expect(await screen.findByText("Stock de HOOD-LOW actualizado")).toBeInTheDocument();
    await waitFor(() => expect(api.listVariants.mock.calls.length).toBeGreaterThan(listCalls));
    await waitFor(() => expect(api.fetchInventoryCounts).toHaveBeenCalled());
    expect(screen.getByLabelText("Hay en total")).toHaveValue("");
  });

  it("si el ajuste saca la variante de la pestaña, la ficha sigue abierta con el dato nuevo", async () => {
    api.listVariants.mockResolvedValueOnce(page([OUT, LOW])).mockResolvedValue(page([OUT]));
    api.updateStock.mockResolvedValue({ ...LOW, onHand: 12, available: 12 });
    renderPage({ estado: "bajo" });
    await userEvent.click(await screen.findByRole("button", { name: /HOOD-LOW/ }));
    await userEvent.type(screen.getByLabelText("Hay en total"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /HOOD-LOW/ })).not.toBeInTheDocument());
    const aside = screen.getByRole("complementary", { name: /Vista previa/ });
    expect(within(aside).getByText("HOOD-LOW")).toBeInTheDocument();
    expect(within(aside).getByText("Disponible", { selector: "dt" }).nextSibling).toHaveTextContent("12");
  });

  it("el modo Movimiento manda delta", async () => {
    api.updateStock.mockResolvedValue({ ...LOW, onHand: 5, available: 5 });
    await openLow();
    await userEvent.click(screen.getByRole("button", { name: "Movimiento" }));
    await userEvent.type(screen.getByLabelText("Suma o resta"), "+2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    expect(api.updateStock).toHaveBeenCalledWith(LOW.id, { delta: 2 });
  });

  it("un 409 del API se muestra junto al campo y no refresca", async () => {
    api.updateStock.mockRejectedValue(new ApiError("Stock insuficiente: la operación dejaría unidades disponibles en negativo.", "http", 409));
    await openLow();
    await userEvent.click(screen.getByRole("button", { name: "Movimiento" }));
    await userEvent.type(screen.getByLabelText("Suma o resta"), "-1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    expect(await screen.findByText(/Stock insuficiente/)).toBeInTheDocument();
    expect(api.fetchInventoryCounts).not.toHaveBeenCalled();
  });

  it("una cantidad inválida se frena en el formulario, sin llamar al API", async () => {
    await openLow();
    await userEvent.type(screen.getByLabelText("Hay en total"), "1.5");
    await userEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    expect(screen.getByText(/números enteros/)).toBeInTheDocument();
    expect(api.updateStock).not.toHaveBeenCalled();
  });

  it("hay un solo botón amarillo en la pantalla", async () => {
    const { container } = render(element());
    await userEvent.click(await screen.findByRole("button", { name: /^Hoodies/ }));
    await userEvent.click(screen.getByRole("button", { name: /HOOD-LOW/ }));
    expect(container.querySelectorAll(".bg-cta")).toHaveLength(1);
  });

  it("el id interno nunca aparece en pantalla", async () => {
    await openLow();
    expect(document.body.textContent).not.toContain(LOW.id);
  });
});

describe("InventoryPage: móvil", () => {
  it("sin panel fijo, elegir una variante abre el SlideOver con su ficha", async () => {
    stubDesktop(false);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /^Hoodies/ }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /HOOD-LOW/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Ajustar stock", { selector: "h3" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
